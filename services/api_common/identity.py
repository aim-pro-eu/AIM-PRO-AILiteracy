"""Host-side map from an authenticated (issuer, ``sub``) to a trusted policy subject key (D9).

The map grants nothing: what a subject may do stays in the trusted policy.
Provider roles and groups are ignored. A person of the configured issuer who is
not listed gets an automatic key (D9 revised, S12b): ``auto-`` and 20 hex
digits of SHA-256 over the issuer and ``sub``, the same at every sign-in, and a
prefix the map may not use. An automatic key grants nothing either: a learner
gains a course by joining it with its code.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Literal

from pydantic import model_validator

from learning.contracts import Record, Text


AUTO_PREFIX = 'auto-'


def auto_subject_key(issuer: str, subject: str) -> str:
    """The automatic subject key of (``issuer``, ``subject``); both values are length-prefixed, so none is ambiguous."""
    digest = hashlib.sha256(f'{len(issuer)}:{issuer}{len(subject)}:{subject}'.encode()).hexdigest()
    return AUTO_PREFIX + digest[:20]


class MappedIdentity(Record):
    issuer: Text
    subject: Text
    subject_key: Text


class IdentityMap(Record):
    format: Literal[1]
    identities: tuple[MappedIdentity, ...]

    @model_validator(mode='after')
    def _unique(self):
        keys = [(entry.issuer, entry.subject) for entry in self.identities]
        if len(keys) != len(set(keys)):
            raise ValueError('An identity is mapped more than once')
        if any(entry.subject_key.startswith(AUTO_PREFIX) for entry in self.identities):
            raise ValueError(f'A mapped subject key may not start with {AUTO_PREFIX}')
        return self

    def subject_key(self, issuer: str, subject: str) -> str | None:
        """Exact match on both values; no normalization of the issuer URL."""
        return next((entry.subject_key for entry in self.identities
                     if (entry.issuer, entry.subject) == (issuer, subject)), None)


def load_identity_map(path: Path) -> IdentityMap:
    return IdentityMap.model_validate_json(Path(path).read_bytes())
