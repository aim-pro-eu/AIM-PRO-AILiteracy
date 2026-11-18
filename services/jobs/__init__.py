"""Agent jobs (S08): generation outside HTTP requests.

- ``store``: the jobs store (D14), apart from the ALM tables.
- ``kinds``: one job kind per existing generator and Curator command, with its exact command.
- ``learner``: the learner request job (S12), a learner's question; it imports no generator.
- ``worker``: the worker loop and the event sink of a job's run; the only code that runs models.
- ``python -m services.jobs``: the worker process, the only process that loads model credentials.

The Authoring API imports ``store`` and ``kinds`` only; the Learner API ``store`` and ``learner`` only.
"""
