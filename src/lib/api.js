async function call(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json; // { id?, state }
}

export const api = {
  state: () => call('GET', '/state'),
  reset: (demo) => call('POST', '/reset', { demo }),
  clear: () => call('POST', '/clear'),
  // { kind, name, currency }: the kind of business sets the words on screen
  saveSettings: (values) => call('PUT', '/settings', values),
  createPackage: (bundle) => call('POST', '/bundles', bundle),
  // sessions: [{ slot_id, class_id, week }] — replaces every week of the package
  setPackageClasses: (id, sessions) => call('PUT', `/bundles/${id}`, { sessions }),
  // { name, anchor_date, end_date, cycle_length, sessions, plans } — the whole package in one save
  updatePackage: (id, bundle) => call('PUT', `/bundles/${id}`, bundle),
  create: (resource, body) => call('POST', `/${resource}`, body),
  update: (resource, id, body) => call('PUT', `/${resource}/${id}`, body),
  remove: (resource, id) => call('DELETE', `/${resource}/${id}`),
  handover: (id, body) => call('POST', `/packages/${id}/handover`, body),
  // Create or update a subscription: { plan_id, start_date, end_date }
  assignMember: (packageId, memberId, sub = {}) => call('POST', `/packages/${packageId}/members`, { member_id: memberId, ...sub }),
  unassignMember: (packageId, memberId) => call('DELETE', `/packages/${packageId}/members/${memberId}`),
};
