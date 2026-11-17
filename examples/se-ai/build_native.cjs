/* Serialize the authored semantic package as a native, self-contained Jjodel project. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const dir = __dirname;
const uid = label => 'Pointer_SEAI_' + crypto.createHash('sha256').update(label).digest('hex').slice(0, 20);
const clone = value => JSON.parse(JSON.stringify(value));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n');

async function main() {
  const [templatePath, compressorPath] = process.argv.slice(2);
  if (!templatePath || !compressorPath) throw new Error('Usage: node build_native.cjs <native-template.jjodel> <async-lz-string-module>');
  const lz = require(path.resolve(compressorPath));
  const templateBytes = fs.readFileSync(templatePath);
  const template = JSON.parse(templateBytes);
  const original = JSON.parse(await lz.decompressFromUTF16(template.state));
  const project = JSON.parse(fs.readFileSync(path.join(dir, 'SE-AI.megamodel.json')));
  const all = Object.values(original.idlookup).filter(o => o && o.className);
  const proto = type => clone(all.find(o => o.className === type));
  const ix = {};
  const base = (type, id, name) => ({className: type, id, name, pointedBy: [], _state: {}, parent: [], annotations: []});
  const put = record => {
    assert(!ix[record.id], 'Duplicate native ID: ' + record.id);
    ix[record.id] = record;
    return record;
  };
  for (const [id, record] of Object.entries(original.idlookup)) {
    if (!id.startsWith('Pointer_') || !['DClass', 'DViewElement', 'DViewPoint'].includes(record?.className)) continue;
    const copy = clone(record);
    copy.pointedBy = [];
    copy._state = {};
    for (const field of ['instances', 'referencedBy', 'edgesIn', 'edgesOut']) if (field in copy) copy[field] = [];
    if ('size' in copy) copy.size = {};
    if ('isSelected' in copy) copy.isSelected = {};
    put(copy);
  }
  const mmByName = new Map(project.definitions.metamodels.map(m => [m.metadata.name, m]));
  const classifier = new Map();
  const enumLiterals = new Map();
  const fieldSpecs = new Map();
  const classSpecs = new Map();
  const ckey = (mid, pkg, name) => [mid, pkg, name].join('/');
  const cid = (mid, pkg, name) => uid('classifier/' + ckey(mid, pkg, name));
  const resolve = (type, owner) => {
    if (typeof type === 'string') {
      const found = Object.values(ix).find(c => c.className === 'DClass' && c.name === type && c.id.startsWith('Pointer_'));
      assert(found, 'Missing native primitive: ' + type);
      return found.id;
    }
    const id = classifier.get(ckey(type.metamodel?.id || owner, type.package, type.name));
    assert(id, 'Unresolved native type: ' + JSON.stringify(type));
    return id;
  };
  const modelRecord = (id, name, isMetamodel, instanceOf = null) => ({...base('DModel', id, name),
    packages: [], isMetamodel, objects: [], models: [], instanceof: instanceOf, instances: [], dependencies: []});

  for (const mm of project.definitions.metamodels) {
    const mid = mm.metadata.id;
    const model = put(modelRecord(mid, mm.metadata.name, true));
    model.dependencies = project.artifacts.metamodels.find(m => m.id === mid).usesMetamodelIds;
    for (const pkg of mm.packages) {
      const pid = uid('package/' + mid + '/' + pkg.name);
      const p = put({...base('DPackage', pid, pkg.name), father: mid, classes: [], enumerators: [], datatypes: [], subpackages: [], uri: '', prefix: ''});
      model.packages.push(pid);
      for (const c of pkg.classes || []) {
        const id = cid(mid, pkg.name, c.name);
        classifier.set(ckey(mid, pkg.name, c.name), id);
        classSpecs.set(id, {spec: c, mid, pkg: pkg.name});
        put({...base('DClass', id, c.name), father: pid, abstract: !!c.abstract, interface: false,
          instances: [], operations: [], features: [], references: [], attributes: [], referencedBy: [], extends: [],
          isPrimitive: false, implements: [], implementedBy: [], partial: false, partialdefaultname: '', isSingleton: false,
          sealed: [], final: false, allowCrossReference: false});
        p.classes.push(id);
      }
      for (const en of pkg.enums || []) {
        const id = cid(mid, pkg.name, en.name);
        classifier.set(ckey(mid, pkg.name, en.name), id);
        const record = put({...base('DEnumerator', id, en.name), father: pid, serializable: true, literals: []});
        enumLiterals.set(id, new Map());
        for (const [i, literal] of en.literals.entries()) {
          const lid = uid(id + '/literal/' + literal.name);
          put({...base('DEnumLiteral', lid, literal.name), father: id, value: literal.value ?? i,
            ...(literal.literal ? {literal: literal.literal} : {})});
          record.literals.push(lid);
          enumLiterals.get(id).set(literal.name, lid);
        }
        p.enumerators.push(id);
      }
      assert(!(pkg.dataTypes || []).length, 'This native package does not use user datatypes');
    }
  }
  for (const [id, {spec, mid}] of classSpecs) {
    const record = ix[id];
    record.extends = (spec.superTypes || []).map(t => resolve(t, mid));
    for (const [section, type] of [['attributes', 'DAttribute'], ['references', 'DReference']]) {
      for (const f of spec[section] || []) {
        const fid = uid(id + '/field/' + f.name);
        const field = {...base(type, fid, f.name), father: id, type: resolve(f.type, mid), ordered: true, unique: true,
          lowerBound: f.lowerBound ?? 0, upperBound: f.upperBound ?? 1, changeable: true, volatile: false,
          transient: false, unsettable: false, defaultValueLiteral: '', allowCrossReference: section === 'references' && !f.containment,
          derived: false, instances: []};
        if (section === 'attributes') Object.assign(field, {isID: false, isIoT: false});
        else Object.assign(field, {composition: !!f.containment, aggregation: false, container: false, target: [], edges: []});
        put(field);
        record[section].push(fid);
        if (section === 'references') ix[field.type].referencedBy.push(fid);
        fieldSpecs.set(fid, {spec: f, section, mid});
      }
    }
  }
  const fields = id => {
    const r = ix[id];
    return [...new Set([...r.extends.flatMap(fields), ...r.attributes, ...r.references])];
  };
  const owned = [];
  const ownedModel = new Map();
  const flatten = (items, md, father) => {
    for (const o of items) {
      owned.push({semantic: o, father: father || md.metadata.id});
      ownedModel.set(o.id, md.metadata.id);
      for (const [name, children] of Object.entries(o.children || {})) flatten(children, md, uid(o.id + '/value/' + name));
    }
  };
  for (const md of project.definitions.models) {
    const record = put(modelRecord(md.metadata.id, md.metadata.name, false, md.metamodel.id));
    ix[md.metamodel.id].instances.push(record.id);
    flatten(md.objects, md);
  }
  for (const {semantic: o, father} of owned) {
    const c = o.class;
    const classId = classifier.get(ckey(c.metamodel.id, c.package, c.name));
    assert(classId);
    const record = put({...base('DObject', o.id, o.name), father, initialName: o.name, instanceof: classId, features: []});
    delete record.annotations;
    ix[classId].instances.push(o.id);
    ix[ownedModel.get(o.id)].objects.push(o.id);
    for (const fid of fields(classId)) {
      const f = ix[fid];
      const {section} = fieldSpecs.get(fid);
      let values;
      if (section === 'attributes') {
        const v = o.attributes?.[f.name];
        values = v === undefined ? [] : Array.isArray(v) ? v : [v];
        if (enumLiterals.has(f.type)) values = values.map(v => {
          const literal = enumLiterals.get(f.type).get(v);
          assert(literal, 'Invalid native enum value: ' + v);
          return literal;
        });
      } else values = f.composition ? (o.children?.[f.name] || []).map(x => x.id) : (o.references?.[f.name] || []).map(x => x.$ref);
      const vid = uid(o.id + '/value/' + f.name);
      put({...base('DValue', vid, f.name), father: o.id, values, instanceof: fid, edges: [],
        isMirage: values.length === 0, allowCrossReference: section === 'references' && !f.composition, topic: ''});
      record.features.push(vid);
      f.instances.push(vid);
    }
  }
  for (const md of project.definitions.models) {
    const deps = new Set();
    for (const {semantic: o} of owned.filter(x => ownedModel.get(x.semantic.id) === md.metadata.id)) {
      for (const rs of Object.values(o.references || {})) for (const r of rs) {
        const targetModel = ownedModel.get(r.$ref);
        if (targetModel !== md.metadata.id) deps.add(targetModel);
      }
    }
    ix[md.metadata.id].dependencies = [...deps];
  }
  const pid = project.metadata.project.id;
  const timestamp = Date.parse(project.metadata.exportedAt);
  const nativeProject = {...base('DProject', pid, project.metadata.project.name), _Id: '', type: 'private', author: null,
    collaborators: [], onlineUsers: 0, metamodels: project.definitions.metamodels.map(m => m.metadata.id),
    models: project.definitions.models.map(m => m.metadata.id), graphs: [], viewpoints: [], activeViewpoint: null,
    favorite: {}, description: 'SE-AI case study: Software Engineering with AI literacy, 4 modules, 8 learning targets, linked resources and formative assessment. Synthetic data, no learner records.',
    creation: timestamp, lastModified: timestamp, viewpointsNumber: 0, metamodelsNumber: project.definitions.metamodels.length, modelsNumber: project.definitions.models.length,
    isFavorite: false, layout: {}, autosaveLayout: true, state: '', version: template.version,
    tagNames: ['education', 'software-engineering', 'ai-literacy', 'isqd'], transformations: [], expandedTreeNodes: [],
    layoutPropertyPanelWidth: 420, layoutTreeWidth: 340, layoutPropertyPanelOpen: true, layoutTreeCollapsed: false,
    layoutFocusCanvas: false, convertedFromDto: true, megamodel: {megamodelVersion: '1.0', edges: []}};
  put(nativeProject);
  const graphTemplate = all.find(o => o.className === 'DGraph' && o.model);
  const vertexTemplate = all.find(o => o.className === 'DVertex' && o.model);
  for (const mid of [...nativeProject.metamodels, ...nativeProject.models]) {
    const gid = uid(mid + '/graph');
    const graph = {...clone(graphTemplate), id: gid, graph: gid, model: mid, pointedBy: [], _state: {}, isSelected: {},
      subElements: [], edgesIn: [], edgesOut: [], x: 0, y: 0, w: 0, h: 0, zoom: {x: 1, y: 1}, offset: {x: 0, y: 0, w: 0, h: 0}};
    put(graph);
    nativeProject.graphs.push(gid);
    const md = ix[mid];
    const nodes = md.isMetamodel ? md.packages.flatMap(p => [...ix[p].classes, ...ix[p].enumerators]) :
      md.objects.filter(id => ix[id].father === mid || ix[ix[id].instanceof].name === 'LearningTarget');
    for (const [i, nodeId] of nodes.entries()) {
      const vid = uid(gid + '/vertex/' + nodeId);
      put({...clone(vertexTemplate), id: vid, pointedBy: [], _state: {}, graph: gid, father: gid, model: nodeId,
        x: 40 + (i % 4) * 310, y: 40 + Math.floor(i / 4) * 140, w: 270, h: 95,
        edgesIn: [], edgesOut: [], subElements: [], isSelected: {}, ghostParentOffsets: {}});
      graph.subElements.push(vid);
    }
  }
  const state = {};
  for (const [key, value] of Object.entries(original)) {
    if (key === 'idlookup') continue;
    state[key] = Array.isArray(value) ? [] : value && typeof value === 'object' ? {} :
      typeof value === 'boolean' ? false : typeof value === 'number' ? 0 : typeof value === 'string' ? '' : null;
  }
  Object.assign(state, {className: 'DState', version: clone(original.version), timestamp, timestampdiff: 0,
    debug: false, idlookup: ix, projects: [pid], viewpoint: 'Pointer_ViewPointDefault'});
  const categories = {
    models: ['DModel'], m2models: ['DModel'], m1models: ['DModel'], viewelements: ['DViewElement', 'DViewPoint'],
    graphs: ['DGraph'], vertexs: ['DVertex'], graphelements: ['DGraph', 'DVertex'], classifiers: ['DClass', 'DEnumerator'],
    enumerators: ['DEnumerator'], packages: ['DPackage'], primitiveTypes: ['DClass'], attributes: ['DAttribute'],
    enumliterals: ['DEnumLiteral'], references: ['DReference'], classs: ['DClass'], objects: ['DObject'], values: ['DValue'], viewpoints: ['DViewPoint'],
  };
  for (const [field, types] of Object.entries(categories)) state[field] = Object.values(ix).filter(o => types.includes(o.className) &&
    (field !== 'm2models' || o.isMetamodel) && (field !== 'm1models' || !o.isMetamodel) &&
    (field !== 'primitiveTypes' || o.isPrimitive)).map(o => o.id);
  // Rebuild reverse pointer paths after all owned records and index arrays exist.
  const point = (value, source) => {
    if (typeof value === 'string' && ix[value]) ix[value].pointedBy.push({source});
    else if (Array.isArray(value)) value.forEach((v, i) => point(v, source.endsWith('.values') ? source + '.' + i : source));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
      if (['pointedBy', 'id', 'state', '_state'].includes(k)) continue;
      point(v, source ? source + '.' + k : k);
    }
  };
  // Array index registries use the array path, as native reducers expect.
  for (const [field, value] of Object.entries(state)) {
    if (field === 'idlookup') continue;
    if (Array.isArray(value)) for (const v of value) if (ix[v]) ix[v].pointedBy.push({source: field});
  }
  for (const [id, record] of Object.entries(ix)) point(record, 'idlookup.' + id);
  // Structural validation and inverse semantic projection, including every instance value.
  for (const o of Object.values(ix)) {
    for (const field of ['father', 'instanceof', 'type', 'graph', 'model']) {
      if (field === 'type' && o.className === 'DProject') continue;
      if (typeof o[field] === 'string') assert(ix[o[field]], `${o.id}.${field}`);
    }
  }
  for (const {semantic: o, father} of owned) {
    const n = ix[o.id];
    assert.equal(n.father, father);
    const expectedFields = fields(n.instanceof);
    assert.deepEqual(n.features.map(v => ix[v].instanceof), expectedFields);
    for (const vid of n.features) {
      const v = ix[vid], f = ix[v.instanceof];
      if (f.className === 'DAttribute') {
        const decoded = v.values.map(x => ix[x]?.className === 'DEnumLiteral' ? ix[x].name : x);
        const expected = o.attributes?.[f.name];
        assert.deepEqual(decoded, expected === undefined ? [] : Array.isArray(expected) ? expected : [expected]);
      } else {
        const expected = f.composition ? (o.children?.[f.name] || []).map(c => c.id) : (o.references?.[f.name] || []).map(r => r.$ref);
        assert.deepEqual(v.values, expected);
        for (const target of v.values) assert.equal(ix[target].className, 'DObject');
        if (f.composition) for (const target of v.values) assert.equal(ix[target].father, vid);
      }
    }
  }
  const text = JSON.stringify(state);
  const compressed = await lz.compressToUTF16(text);
  assert.equal(await lz.decompressFromUTF16(compressed), text);
  const output = {...clone(nativeProject), state: compressed};
  save('SE-AI.jjodel', output);
  const reread = JSON.parse(fs.readFileSync(path.join(dir, 'SE-AI.jjodel')));
  assert.deepEqual(JSON.parse(await lz.decompressFromUTF16(reread.state)), state);
  assert.equal(state.users.length, 0);
  assert.equal(Object.values(ix).filter(o => o.className === 'DUser').length, 0);
  assert.equal(Object.values(ix).filter(o => o.className === 'DObject').length, owned.length);
  save('native-validation.json', {status: 'PASS', scope: 'Native record graph, every semantic instance and value, enum encoding, containment fathers, compressed serialization round trip',
    models: state.m1models.length, metamodels: state.m2models.length, objects: state.objects.length, values: state.values.length,
    native_records: Object.keys(ix).length, source_template_sha256: sha(templateBytes),
    semantic_source_sha256: sha(fs.readFileSync(path.join(dir, 'SE-AI.megamodel.json'))), native_sha256: sha(fs.readFileSync(path.join(dir, 'SE-AI.jjodel'))),
    user_records: 0, limitation: 'No live UI import/export was executed. The importer duplicates IDs; use stable names and competency ID attributes to identify imported records. Annex pointer IDs describe the delivered package before importer duplication.'});
  console.log(JSON.stringify({status: 'PASS', native_records: Object.keys(ix).length, objects: state.objects.length, values: state.values.length}));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
