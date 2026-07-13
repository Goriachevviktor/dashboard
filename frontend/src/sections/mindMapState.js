export function cloneMindMapNode(node) {
  return {
    ...node,
    children: (node.children || []).map(cloneMindMapNode),
  };
}

function countNodes(node) {
  return 1 + (node.children || []).reduce((total, child) => total + countNodes(child), 0);
}

function collectProgress(node, values = []) {
  if (typeof node.progress === 'number') values.push(Math.max(0, Math.min(100, node.progress)));
  (node.children || []).forEach(child => collectProgress(child, values));
  return values;
}

export function enrichMindMap(map) {
  const root = cloneMindMapNode(map.root);
  const progress = collectProgress(root);
  const branches = root.children || [];
  return {
    ...map,
    id: String(map.id),
    desc: map.desc || '',
    tag: map.tag || '',
    tagColor: map.tagColor || '#3b6fe0',
    status: map.status || 'draft',
    root,
    nodeCount: Math.max(0, countNodes(root) - 1),
    branchCount: branches.length,
    progress: progress.length ? Math.round(progress.reduce((sum, value) => sum + value, 0) / progress.length) : 0,
    palette: branches.map(branch => branch.color).filter(Boolean),
  };
}

export function normalizeMindMaps(maps) {
  if (!Array.isArray(maps)) return [];
  return maps
    .filter(map => map && map.id != null && map.root && typeof map.root === 'object')
    .map(enrichMindMap);
}
