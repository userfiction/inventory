//#region src/inventory.ts
var e = (e, t) => e[t] ?? 0, t = (t, n, r) => (t[n] = e(t, n) + r, t), n = (t, n, r) => {
	if (e(t, n) < r) return !1;
	let i = e(t, n) - r;
	return i === 0 ? delete t[n] : t[n] = i, !0;
}, r = (e) => {
	let r = {
		add: (n, i = 1) => (t(e, n, i), r),
		remove: (t, r = 1) => n(e, t, r)
	};
	return r;
};
//#endregion
export { r as createUserInventory };

//# sourceMappingURL=userfiction-inventory.mjs.map