export const EventBus = {
  _map: new Map(),
  on(evt, cb) {
    if (!this._map.has(evt)) this._map.set(evt, new Set());
    this._map.get(evt).add(cb);
    return () => this.off(evt, cb);
  },
  off(evt, cb) {
    const s = this._map.get(evt);
    if (s) s.delete(cb);
  },
  emit(evt, data) {
    const s = this._map.get(evt);
    if (s) s.forEach(cb => cb(data));
  },
  once(evt, cb) {
    const wrap = d => { cb(d); this.off(evt, wrap); };
    this.on(evt, wrap);
    return () => this.off(evt, wrap);
  },
};