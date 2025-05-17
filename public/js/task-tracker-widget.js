// node_modules/@lit/reactive-element/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
    constructor(t5, e5, o5) {
        if (this._$cssResult$ = true, o5 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
        this.cssText = t5, this.t = e5;
    }
    get styleSheet() {
        let t5 = this.o;
        const s5 = this.t;
        if (e && void 0 === t5) {
            const e5 = void 0 !== s5 && 1 === s5.length;
            e5 && (t5 = o.get(s5)), void 0 === t5 && ((this.o = t5 = new CSSStyleSheet()).replaceSync(this.cssText), e5 && o.set(s5, t5));
        }
        return t5;
    }
    toString() {
        return this.cssText;
    }
};
var r = (t5) => new n("string" == typeof t5 ? t5 : t5 + "", void 0, s);
var i = (t5, ...e5) => {
    const o5 = 1 === t5.length ? t5[0] : e5.reduce((e6, s5, o6) => e6 + ((t6) => {
        if (true === t6._$cssResult$) return t6.cssText;
        if ("number" == typeof t6) return t6;
        throw Error("Value passed to 'css' function must be a 'css' function result: " + t6 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
    })(s5) + t5[o6 + 1], t5[0]);
    return new n(o5, t5, s);
};
var S = (s5, o5) => {
    if (e) s5.adoptedStyleSheets = o5.map((t5) => t5 instanceof CSSStyleSheet ? t5 : t5.styleSheet);
    else for (const e5 of o5) {
        const o6 = document.createElement("style"), n4 = t.litNonce;
        void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e5.cssText, s5.appendChild(o6);
    }
};
var c = e ? (t5) => t5 : (t5) => t5 instanceof CSSStyleSheet ? ((t6) => {
    let e5 = "";
    for (const s5 of t6.cssRules) e5 += s5.cssText;
    return r(e5);
})(t5) : t5;

// node_modules/@lit/reactive-element/reactive-element.js
var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
var a = globalThis;
var c2 = a.trustedTypes;
var l = c2 ? c2.emptyScript : "";
var p = a.reactiveElementPolyfillSupport;
var d = (t5, s5) => t5;
var u = { toAttribute(t5, s5) {
        switch (s5) {
            case Boolean:
                t5 = t5 ? l : null;
                break;
            case Object:
            case Array:
                t5 = null == t5 ? t5 : JSON.stringify(t5);
        }
        return t5;
    }, fromAttribute(t5, s5) {
        let i6 = t5;
        switch (s5) {
            case Boolean:
                i6 = null !== t5;
                break;
            case Number:
                i6 = null === t5 ? null : Number(t5);
                break;
            case Object:
            case Array:
                try {
                    i6 = JSON.parse(t5);
                } catch (t6) {
                    i6 = null;
                }
        }
        return i6;
    } };
var f = (t5, s5) => !i2(t5, s5);
var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
Symbol.metadata ??= Symbol("metadata"), a.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var y = class extends HTMLElement {
    static addInitializer(t5) {
        this._$Ei(), (this.l ??= []).push(t5);
    }
    static get observedAttributes() {
        return this.finalize(), this._$Eh && [...this._$Eh.keys()];
    }
    static createProperty(t5, s5 = b) {
        if (s5.state && (s5.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t5) && ((s5 = Object.create(s5)).wrapped = true), this.elementProperties.set(t5, s5), !s5.noAccessor) {
            const i6 = Symbol(), h3 = this.getPropertyDescriptor(t5, i6, s5);
            void 0 !== h3 && e2(this.prototype, t5, h3);
        }
    }
    static getPropertyDescriptor(t5, s5, i6) {
        const { get: e5, set: r5 } = h(this.prototype, t5) ?? { get() {
                return this[s5];
            }, set(t6) {
                this[s5] = t6;
            } };
        return { get: e5, set(s6) {
                const h3 = e5?.call(this);
                r5?.call(this, s6), this.requestUpdate(t5, h3, i6);
            }, configurable: true, enumerable: true };
    }
    static getPropertyOptions(t5) {
        return this.elementProperties.get(t5) ?? b;
    }
    static _$Ei() {
        if (this.hasOwnProperty(d("elementProperties"))) return;
        const t5 = n2(this);
        t5.finalize(), void 0 !== t5.l && (this.l = [...t5.l]), this.elementProperties = new Map(t5.elementProperties);
    }
    static finalize() {
        if (this.hasOwnProperty(d("finalized"))) return;
        if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
            const t6 = this.properties, s5 = [...r2(t6), ...o2(t6)];
            for (const i6 of s5) this.createProperty(i6, t6[i6]);
        }
        const t5 = this[Symbol.metadata];
        if (null !== t5) {
            const s5 = litPropertyMetadata.get(t5);
            if (void 0 !== s5) for (const [t6, i6] of s5) this.elementProperties.set(t6, i6);
        }
        this._$Eh = /* @__PURE__ */ new Map();
        for (const [t6, s5] of this.elementProperties) {
            const i6 = this._$Eu(t6, s5);
            void 0 !== i6 && this._$Eh.set(i6, t6);
        }
        this.elementStyles = this.finalizeStyles(this.styles);
    }
    static finalizeStyles(s5) {
        const i6 = [];
        if (Array.isArray(s5)) {
            const e5 = new Set(s5.flat(1 / 0).reverse());
            for (const s6 of e5) i6.unshift(c(s6));
        } else void 0 !== s5 && i6.push(c(s5));
        return i6;
    }
    static _$Eu(t5, s5) {
        const i6 = s5.attribute;
        return false === i6 ? void 0 : "string" == typeof i6 ? i6 : "string" == typeof t5 ? t5.toLowerCase() : void 0;
    }
    constructor() {
        super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
    }
    _$Ev() {
        this._$ES = new Promise((t5) => this.enableUpdating = t5), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t5) => t5(this));
    }
    addController(t5) {
        (this._$EO ??= /* @__PURE__ */ new Set()).add(t5), void 0 !== this.renderRoot && this.isConnected && t5.hostConnected?.();
    }
    removeController(t5) {
        this._$EO?.delete(t5);
    }
    _$E_() {
        const t5 = /* @__PURE__ */ new Map(), s5 = this.constructor.elementProperties;
        for (const i6 of s5.keys()) this.hasOwnProperty(i6) && (t5.set(i6, this[i6]), delete this[i6]);
        t5.size > 0 && (this._$Ep = t5);
    }
    createRenderRoot() {
        const t5 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
        return S(t5, this.constructor.elementStyles), t5;
    }
    connectedCallback() {
        this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t5) => t5.hostConnected?.());
    }
    enableUpdating(t5) {
    }
    disconnectedCallback() {
        this._$EO?.forEach((t5) => t5.hostDisconnected?.());
    }
    attributeChangedCallback(t5, s5, i6) {
        this._$AK(t5, i6);
    }
    _$ET(t5, s5) {
        const i6 = this.constructor.elementProperties.get(t5), e5 = this.constructor._$Eu(t5, i6);
        if (void 0 !== e5 && true === i6.reflect) {
            const h3 = (void 0 !== i6.converter?.toAttribute ? i6.converter : u).toAttribute(s5, i6.type);
            this._$Em = t5, null == h3 ? this.removeAttribute(e5) : this.setAttribute(e5, h3), this._$Em = null;
        }
    }
    _$AK(t5, s5) {
        const i6 = this.constructor, e5 = i6._$Eh.get(t5);
        if (void 0 !== e5 && this._$Em !== e5) {
            const t6 = i6.getPropertyOptions(e5), h3 = "function" == typeof t6.converter ? { fromAttribute: t6.converter } : void 0 !== t6.converter?.fromAttribute ? t6.converter : u;
            this._$Em = e5, this[e5] = h3.fromAttribute(s5, t6.type) ?? this._$Ej?.get(e5) ?? null, this._$Em = null;
        }
    }
    requestUpdate(t5, s5, i6) {
        if (void 0 !== t5) {
            const e5 = this.constructor, h3 = this[t5];
            if (i6 ??= e5.getPropertyOptions(t5), !((i6.hasChanged ?? f)(h3, s5) || i6.useDefault && i6.reflect && h3 === this._$Ej?.get(t5) && !this.hasAttribute(e5._$Eu(t5, i6)))) return;
            this.C(t5, s5, i6);
        }
        false === this.isUpdatePending && (this._$ES = this._$EP());
    }
    C(t5, s5, { useDefault: i6, reflect: e5, wrapped: h3 }, r5) {
        i6 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t5) && (this._$Ej.set(t5, r5 ?? s5 ?? this[t5]), true !== h3 || void 0 !== r5) || (this._$AL.has(t5) || (this.hasUpdated || i6 || (s5 = void 0), this._$AL.set(t5, s5)), true === e5 && this._$Em !== t5 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t5));
    }
    async _$EP() {
        this.isUpdatePending = true;
        try {
            await this._$ES;
        } catch (t6) {
            Promise.reject(t6);
        }
        const t5 = this.scheduleUpdate();
        return null != t5 && await t5, !this.isUpdatePending;
    }
    scheduleUpdate() {
        return this.performUpdate();
    }
    performUpdate() {
        if (!this.isUpdatePending) return;
        if (!this.hasUpdated) {
            if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
                for (const [t7, s6] of this._$Ep) this[t7] = s6;
                this._$Ep = void 0;
            }
            const t6 = this.constructor.elementProperties;
            if (t6.size > 0) for (const [s6, i6] of t6) {
                const { wrapped: t7 } = i6, e5 = this[s6];
                true !== t7 || this._$AL.has(s6) || void 0 === e5 || this.C(s6, void 0, i6, e5);
            }
        }
        let t5 = false;
        const s5 = this._$AL;
        try {
            t5 = this.shouldUpdate(s5), t5 ? (this.willUpdate(s5), this._$EO?.forEach((t6) => t6.hostUpdate?.()), this.update(s5)) : this._$EM();
        } catch (s6) {
            throw t5 = false, this._$EM(), s6;
        }
        t5 && this._$AE(s5);
    }
    willUpdate(t5) {
    }
    _$AE(t5) {
        this._$EO?.forEach((t6) => t6.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t5)), this.updated(t5);
    }
    _$EM() {
        this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
    }
    get updateComplete() {
        return this.getUpdateComplete();
    }
    getUpdateComplete() {
        return this._$ES;
    }
    shouldUpdate(t5) {
        return true;
    }
    update(t5) {
        this._$Eq &&= this._$Eq.forEach((t6) => this._$ET(t6, this[t6])), this._$EM();
    }
    updated(t5) {
    }
    firstUpdated(t5) {
    }
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ??= []).push("2.1.0");

// node_modules/lit-html/lit-html.js
var t2 = globalThis;
var i3 = t2.trustedTypes;
var s2 = i3 ? i3.createPolicy("lit-html", { createHTML: (t5) => t5 }) : void 0;
var e3 = "$lit$";
var h2 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var o3 = "?" + h2;
var n3 = `<${o3}>`;
var r3 = document;
var l2 = () => r3.createComment("");
var c3 = (t5) => null === t5 || "object" != typeof t5 && "function" != typeof t5;
var a2 = Array.isArray;
var u2 = (t5) => a2(t5) || "function" == typeof t5?.[Symbol.iterator];
var d2 = "[ 	\n\f\r]";
var f2 = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var v = /-->/g;
var _ = />/g;
var m = RegExp(`>|${d2}(?:([^\\s"'>=/]+)(${d2}*=${d2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var p2 = /'/g;
var g = /"/g;
var $ = /^(?:script|style|textarea|title)$/i;
var y2 = (t5) => (i6, ...s5) => ({ _$litType$: t5, strings: i6, values: s5 });
var x = y2(1);
var b2 = y2(2);
var w = y2(3);
var T = Symbol.for("lit-noChange");
var E = Symbol.for("lit-nothing");
var A = /* @__PURE__ */ new WeakMap();
var C = r3.createTreeWalker(r3, 129);
function P(t5, i6) {
    if (!a2(t5) || !t5.hasOwnProperty("raw")) throw Error("invalid template strings array");
    return void 0 !== s2 ? s2.createHTML(i6) : i6;
}
var V = (t5, i6) => {
    const s5 = t5.length - 1, o5 = [];
    let r5, l3 = 2 === i6 ? "<svg>" : 3 === i6 ? "<math>" : "", c5 = f2;
    for (let i7 = 0; i7 < s5; i7++) {
        const s6 = t5[i7];
        let a3, u5, d3 = -1, y3 = 0;
        for (; y3 < s6.length && (c5.lastIndex = y3, u5 = c5.exec(s6), null !== u5); ) y3 = c5.lastIndex, c5 === f2 ? "!--" === u5[1] ? c5 = v : void 0 !== u5[1] ? c5 = _ : void 0 !== u5[2] ? ($.test(u5[2]) && (r5 = RegExp("</" + u5[2], "g")), c5 = m) : void 0 !== u5[3] && (c5 = m) : c5 === m ? ">" === u5[0] ? (c5 = r5 ?? f2, d3 = -1) : void 0 === u5[1] ? d3 = -2 : (d3 = c5.lastIndex - u5[2].length, a3 = u5[1], c5 = void 0 === u5[3] ? m : '"' === u5[3] ? g : p2) : c5 === g || c5 === p2 ? c5 = m : c5 === v || c5 === _ ? c5 = f2 : (c5 = m, r5 = void 0);
        const x2 = c5 === m && t5[i7 + 1].startsWith("/>") ? " " : "";
        l3 += c5 === f2 ? s6 + n3 : d3 >= 0 ? (o5.push(a3), s6.slice(0, d3) + e3 + s6.slice(d3) + h2 + x2) : s6 + h2 + (-2 === d3 ? i7 : x2);
    }
    return [P(t5, l3 + (t5[s5] || "<?>") + (2 === i6 ? "</svg>" : 3 === i6 ? "</math>" : "")), o5];
};
var N = class _N {
    constructor({ strings: t5, _$litType$: s5 }, n4) {
        let r5;
        this.parts = [];
        let c5 = 0, a3 = 0;
        const u5 = t5.length - 1, d3 = this.parts, [f3, v3] = V(t5, s5);
        if (this.el = _N.createElement(f3, n4), C.currentNode = this.el.content, 2 === s5 || 3 === s5) {
            const t6 = this.el.content.firstChild;
            t6.replaceWith(...t6.childNodes);
        }
        for (; null !== (r5 = C.nextNode()) && d3.length < u5; ) {
            if (1 === r5.nodeType) {
                if (r5.hasAttributes()) for (const t6 of r5.getAttributeNames()) if (t6.endsWith(e3)) {
                    const i6 = v3[a3++], s6 = r5.getAttribute(t6).split(h2), e5 = /([.?@])?(.*)/.exec(i6);
                    d3.push({ type: 1, index: c5, name: e5[2], strings: s6, ctor: "." === e5[1] ? H : "?" === e5[1] ? I : "@" === e5[1] ? L : k }), r5.removeAttribute(t6);
                } else t6.startsWith(h2) && (d3.push({ type: 6, index: c5 }), r5.removeAttribute(t6));
                if ($.test(r5.tagName)) {
                    const t6 = r5.textContent.split(h2), s6 = t6.length - 1;
                    if (s6 > 0) {
                        r5.textContent = i3 ? i3.emptyScript : "";
                        for (let i6 = 0; i6 < s6; i6++) r5.append(t6[i6], l2()), C.nextNode(), d3.push({ type: 2, index: ++c5 });
                        r5.append(t6[s6], l2());
                    }
                }
            } else if (8 === r5.nodeType) if (r5.data === o3) d3.push({ type: 2, index: c5 });
            else {
                let t6 = -1;
                for (; -1 !== (t6 = r5.data.indexOf(h2, t6 + 1)); ) d3.push({ type: 7, index: c5 }), t6 += h2.length - 1;
            }
            c5++;
        }
    }
    static createElement(t5, i6) {
        const s5 = r3.createElement("template");
        return s5.innerHTML = t5, s5;
    }
};
function S2(t5, i6, s5 = t5, e5) {
    if (i6 === T) return i6;
    let h3 = void 0 !== e5 ? s5._$Co?.[e5] : s5._$Cl;
    const o5 = c3(i6) ? void 0 : i6._$litDirective$;
    return h3?.constructor !== o5 && (h3?._$AO?.(false), void 0 === o5 ? h3 = void 0 : (h3 = new o5(t5), h3._$AT(t5, s5, e5)), void 0 !== e5 ? (s5._$Co ??= [])[e5] = h3 : s5._$Cl = h3), void 0 !== h3 && (i6 = S2(t5, h3._$AS(t5, i6.values), h3, e5)), i6;
}
var M = class {
    constructor(t5, i6) {
        this._$AV = [], this._$AN = void 0, this._$AD = t5, this._$AM = i6;
    }
    get parentNode() {
        return this._$AM.parentNode;
    }
    get _$AU() {
        return this._$AM._$AU;
    }
    u(t5) {
        const { el: { content: i6 }, parts: s5 } = this._$AD, e5 = (t5?.creationScope ?? r3).importNode(i6, true);
        C.currentNode = e5;
        let h3 = C.nextNode(), o5 = 0, n4 = 0, l3 = s5[0];
        for (; void 0 !== l3; ) {
            if (o5 === l3.index) {
                let i7;
                2 === l3.type ? i7 = new R(h3, h3.nextSibling, this, t5) : 1 === l3.type ? i7 = new l3.ctor(h3, l3.name, l3.strings, this, t5) : 6 === l3.type && (i7 = new z(h3, this, t5)), this._$AV.push(i7), l3 = s5[++n4];
            }
            o5 !== l3?.index && (h3 = C.nextNode(), o5++);
        }
        return C.currentNode = r3, e5;
    }
    p(t5) {
        let i6 = 0;
        for (const s5 of this._$AV) void 0 !== s5 && (void 0 !== s5.strings ? (s5._$AI(t5, s5, i6), i6 += s5.strings.length - 2) : s5._$AI(t5[i6])), i6++;
    }
};
var R = class _R {
    get _$AU() {
        return this._$AM?._$AU ?? this._$Cv;
    }
    constructor(t5, i6, s5, e5) {
        this.type = 2, this._$AH = E, this._$AN = void 0, this._$AA = t5, this._$AB = i6, this._$AM = s5, this.options = e5, this._$Cv = e5?.isConnected ?? true;
    }
    get parentNode() {
        let t5 = this._$AA.parentNode;
        const i6 = this._$AM;
        return void 0 !== i6 && 11 === t5?.nodeType && (t5 = i6.parentNode), t5;
    }
    get startNode() {
        return this._$AA;
    }
    get endNode() {
        return this._$AB;
    }
    _$AI(t5, i6 = this) {
        t5 = S2(this, t5, i6), c3(t5) ? t5 === E || null == t5 || "" === t5 ? (this._$AH !== E && this._$AR(), this._$AH = E) : t5 !== this._$AH && t5 !== T && this._(t5) : void 0 !== t5._$litType$ ? this.$(t5) : void 0 !== t5.nodeType ? this.T(t5) : u2(t5) ? this.k(t5) : this._(t5);
    }
    O(t5) {
        return this._$AA.parentNode.insertBefore(t5, this._$AB);
    }
    T(t5) {
        this._$AH !== t5 && (this._$AR(), this._$AH = this.O(t5));
    }
    _(t5) {
        this._$AH !== E && c3(this._$AH) ? this._$AA.nextSibling.data = t5 : this.T(r3.createTextNode(t5)), this._$AH = t5;
    }
    $(t5) {
        const { values: i6, _$litType$: s5 } = t5, e5 = "number" == typeof s5 ? this._$AC(t5) : (void 0 === s5.el && (s5.el = N.createElement(P(s5.h, s5.h[0]), this.options)), s5);
        if (this._$AH?._$AD === e5) this._$AH.p(i6);
        else {
            const t6 = new M(e5, this), s6 = t6.u(this.options);
            t6.p(i6), this.T(s6), this._$AH = t6;
        }
    }
    _$AC(t5) {
        let i6 = A.get(t5.strings);
        return void 0 === i6 && A.set(t5.strings, i6 = new N(t5)), i6;
    }
    k(t5) {
        a2(this._$AH) || (this._$AH = [], this._$AR());
        const i6 = this._$AH;
        let s5, e5 = 0;
        for (const h3 of t5) e5 === i6.length ? i6.push(s5 = new _R(this.O(l2()), this.O(l2()), this, this.options)) : s5 = i6[e5], s5._$AI(h3), e5++;
        e5 < i6.length && (this._$AR(s5 && s5._$AB.nextSibling, e5), i6.length = e5);
    }
    _$AR(t5 = this._$AA.nextSibling, i6) {
        for (this._$AP?.(false, true, i6); t5 && t5 !== this._$AB; ) {
            const i7 = t5.nextSibling;
            t5.remove(), t5 = i7;
        }
    }
    setConnected(t5) {
        void 0 === this._$AM && (this._$Cv = t5, this._$AP?.(t5));
    }
};
var k = class {
    get tagName() {
        return this.element.tagName;
    }
    get _$AU() {
        return this._$AM._$AU;
    }
    constructor(t5, i6, s5, e5, h3) {
        this.type = 1, this._$AH = E, this._$AN = void 0, this.element = t5, this.name = i6, this._$AM = e5, this.options = h3, s5.length > 2 || "" !== s5[0] || "" !== s5[1] ? (this._$AH = Array(s5.length - 1).fill(new String()), this.strings = s5) : this._$AH = E;
    }
    _$AI(t5, i6 = this, s5, e5) {
        const h3 = this.strings;
        let o5 = false;
        if (void 0 === h3) t5 = S2(this, t5, i6, 0), o5 = !c3(t5) || t5 !== this._$AH && t5 !== T, o5 && (this._$AH = t5);
        else {
            const e6 = t5;
            let n4, r5;
            for (t5 = h3[0], n4 = 0; n4 < h3.length - 1; n4++) r5 = S2(this, e6[s5 + n4], i6, n4), r5 === T && (r5 = this._$AH[n4]), o5 ||= !c3(r5) || r5 !== this._$AH[n4], r5 === E ? t5 = E : t5 !== E && (t5 += (r5 ?? "") + h3[n4 + 1]), this._$AH[n4] = r5;
        }
        o5 && !e5 && this.j(t5);
    }
    j(t5) {
        t5 === E ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t5 ?? "");
    }
};
var H = class extends k {
    constructor() {
        super(...arguments), this.type = 3;
    }
    j(t5) {
        this.element[this.name] = t5 === E ? void 0 : t5;
    }
};
var I = class extends k {
    constructor() {
        super(...arguments), this.type = 4;
    }
    j(t5) {
        this.element.toggleAttribute(this.name, !!t5 && t5 !== E);
    }
};
var L = class extends k {
    constructor(t5, i6, s5, e5, h3) {
        super(t5, i6, s5, e5, h3), this.type = 5;
    }
    _$AI(t5, i6 = this) {
        if ((t5 = S2(this, t5, i6, 0) ?? E) === T) return;
        const s5 = this._$AH, e5 = t5 === E && s5 !== E || t5.capture !== s5.capture || t5.once !== s5.once || t5.passive !== s5.passive, h3 = t5 !== E && (s5 === E || e5);
        e5 && this.element.removeEventListener(this.name, this, s5), h3 && this.element.addEventListener(this.name, this, t5), this._$AH = t5;
    }
    handleEvent(t5) {
        "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t5) : this._$AH.handleEvent(t5);
    }
};
var z = class {
    constructor(t5, i6, s5) {
        this.element = t5, this.type = 6, this._$AN = void 0, this._$AM = i6, this.options = s5;
    }
    get _$AU() {
        return this._$AM._$AU;
    }
    _$AI(t5) {
        S2(this, t5);
    }
};
var Z = { M: e3, P: h2, A: o3, C: 1, L: V, R: M, D: u2, V: S2, I: R, H: k, N: I, U: L, B: H, F: z };
var j = t2.litHtmlPolyfillSupport;
j?.(N, R), (t2.litHtmlVersions ??= []).push("3.3.0");
var B = (t5, i6, s5) => {
    const e5 = s5?.renderBefore ?? i6;
    let h3 = e5._$litPart$;
    if (void 0 === h3) {
        const t6 = s5?.renderBefore ?? null;
        e5._$litPart$ = h3 = new R(i6.insertBefore(l2(), t6), t6, void 0, s5 ?? {});
    }
    return h3._$AI(t5), h3;
};

// node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i4 = class extends y {
    constructor() {
        super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
    }
    createRenderRoot() {
        const t5 = super.createRenderRoot();
        return this.renderOptions.renderBefore ??= t5.firstChild, t5;
    }
    update(t5) {
        const r5 = this.render();
        this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t5), this._$Do = B(r5, this.renderRoot, this.renderOptions);
    }
    connectedCallback() {
        super.connectedCallback(), this._$Do?.setConnected(true);
    }
    disconnectedCallback() {
        super.disconnectedCallback(), this._$Do?.setConnected(false);
    }
    render() {
        return T;
    }
};
i4._$litElement$ = true, i4["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i4 });
var o4 = s3.litElementPolyfillSupport;
o4?.({ LitElement: i4 });
(s3.litElementVersions ??= []).push("4.2.0");

// node_modules/lit-html/directive.js
var t3 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
var e4 = (t5) => (...e5) => ({ _$litDirective$: t5, values: e5 });
var i5 = class {
    constructor(t5) {
    }
    get _$AU() {
        return this._$AM._$AU;
    }
    _$AT(t5, e5, i6) {
        this._$Ct = t5, this._$AM = e5, this._$Ci = i6;
    }
    _$AS(t5, e5) {
        return this.update(t5, e5);
    }
    update(t5, e5) {
        return this.render(...e5);
    }
};

// node_modules/lit-html/directive-helpers.js
var { I: t4 } = Z;
var s4 = () => document.createComment("");
var r4 = (o5, i6, n4) => {
    const e5 = o5._$AA.parentNode, l3 = void 0 === i6 ? o5._$AB : i6._$AA;
    if (void 0 === n4) {
        const i7 = e5.insertBefore(s4(), l3), c5 = e5.insertBefore(s4(), l3);
        n4 = new t4(i7, c5, o5, o5.options);
    } else {
        const t5 = n4._$AB.nextSibling, i7 = n4._$AM, c5 = i7 !== o5;
        if (c5) {
            let t6;
            n4._$AQ?.(o5), n4._$AM = o5, void 0 !== n4._$AP && (t6 = o5._$AU) !== i7._$AU && n4._$AP(t6);
        }
        if (t5 !== l3 || c5) {
            let o6 = n4._$AA;
            for (; o6 !== t5; ) {
                const t6 = o6.nextSibling;
                e5.insertBefore(o6, l3), o6 = t6;
            }
        }
    }
    return n4;
};
var v2 = (o5, t5, i6 = o5) => (o5._$AI(t5, i6), o5);
var u3 = {};
var m2 = (o5, t5 = u3) => o5._$AH = t5;
var p3 = (o5) => o5._$AH;
var M2 = (o5) => {
    o5._$AP?.(false, true);
    let t5 = o5._$AA;
    const i6 = o5._$AB.nextSibling;
    for (; t5 !== i6; ) {
        const o6 = t5.nextSibling;
        t5.remove(), t5 = o6;
    }
};

// node_modules/lit-html/directives/repeat.js
var u4 = (e5, s5, t5) => {
    const r5 = /* @__PURE__ */ new Map();
    for (let l3 = s5; l3 <= t5; l3++) r5.set(e5[l3], l3);
    return r5;
};
var c4 = e4(class extends i5 {
    constructor(e5) {
        if (super(e5), e5.type !== t3.CHILD) throw Error("repeat() can only be used in text expressions");
    }
    dt(e5, s5, t5) {
        let r5;
        void 0 === t5 ? t5 = s5 : void 0 !== s5 && (r5 = s5);
        const l3 = [], o5 = [];
        let i6 = 0;
        for (const s6 of e5) l3[i6] = r5 ? r5(s6, i6) : i6, o5[i6] = t5(s6, i6), i6++;
        return { values: o5, keys: l3 };
    }
    render(e5, s5, t5) {
        return this.dt(e5, s5, t5).values;
    }
    update(s5, [t5, r5, c5]) {
        const d3 = p3(s5), { values: p4, keys: a3 } = this.dt(t5, r5, c5);
        if (!Array.isArray(d3)) return this.ut = a3, p4;
        const h3 = this.ut ??= [], v3 = [];
        let m3, y3, x2 = 0, j2 = d3.length - 1, k2 = 0, w2 = p4.length - 1;
        for (; x2 <= j2 && k2 <= w2; ) if (null === d3[x2]) x2++;
        else if (null === d3[j2]) j2--;
        else if (h3[x2] === a3[k2]) v3[k2] = v2(d3[x2], p4[k2]), x2++, k2++;
        else if (h3[j2] === a3[w2]) v3[w2] = v2(d3[j2], p4[w2]), j2--, w2--;
        else if (h3[x2] === a3[w2]) v3[w2] = v2(d3[x2], p4[w2]), r4(s5, v3[w2 + 1], d3[x2]), x2++, w2--;
        else if (h3[j2] === a3[k2]) v3[k2] = v2(d3[j2], p4[k2]), r4(s5, d3[x2], d3[j2]), j2--, k2++;
        else if (void 0 === m3 && (m3 = u4(a3, k2, w2), y3 = u4(h3, x2, j2)), m3.has(h3[x2])) if (m3.has(h3[j2])) {
            const e5 = y3.get(a3[k2]), t6 = void 0 !== e5 ? d3[e5] : null;
            if (null === t6) {
                const e6 = r4(s5, d3[x2]);
                v2(e6, p4[k2]), v3[k2] = e6;
            } else v3[k2] = v2(t6, p4[k2]), r4(s5, d3[x2], t6), d3[e5] = null;
            k2++;
        } else M2(d3[j2]), j2--;
        else M2(d3[x2]), x2++;
        for (; k2 <= w2; ) {
            const e5 = r4(s5, v3[w2 + 1]);
            v2(e5, p4[k2]), v3[k2++] = e5;
        }
        for (; x2 <= j2; ) {
            const e5 = d3[x2++];
            null !== e5 && M2(e5);
        }
        return this.ut = a3, m2(s5, v3), T;
    }
});

// libs/task-tracker/src/task-tracker-widget.ts
var TaskTrackerWidget = class _TaskTrackerWidget extends i4 {
    // ------------------ styles ------------------
    static styles = i`
    :host {
      /* Use the app's CSS variables with fallbacks */
      --primary-bg: var(--bg-primary, #121212);
      --secondary-bg: var(--bg-secondary, #1a1a1a);
      --tertiary-bg: var(--bg-tertiary, #252525);
      --text-color: var(--text-primary, #d9dfe7);
      --secondary-text: var(--text-secondary, #888);

      /* Use app accent colors with fallbacks */
      --gradient-start: var(--accent-quaternary, #ff715b);
      --gradient-mid1: var(--accent-tertiary, #ffd166);
      --gradient-mid2: var(--accent-secondary, #7b61ff);
      --gradient-end: var(--accent-primary, #40a2e3);

      --border-color: var(--border-primary, #333);
      --border-radius: 8px;

      --success-color: var(--status-success, #7dd1c1);
      --error-color: var(--status-error, #f8a5a6);

      display: block;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
        sans-serif;
      color: var(--text-color);
    }

    /* Outer section with a simple border */
    .ai-tasks-section {
      position: relative;
      border-radius: var(--border-radius);
      overflow: hidden;
      border: 1px solid var(--border-color);

      /*
       * Allow the host element to control the overall size of the widget.
       * When a fixed height is applied to <task-tracker-widget>, the section
       * will take up 100% of that height and distribute the available
       * vertical space between the header (intrinsic height) and the task
       * list which becomes scrollable. If the host element does **not** set
       * an explicit height, the widget keeps the original grow‑with‑content
       * behaviour because the flex container will simply expand.
       */
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    /* Task section animation keyframe definition removed */

    /* Header */
    .ai-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      background-color: var(--tertiary-bg);
      border-radius: 0;
      border-bottom: 1px solid var(--border-color);
      font-size: 15px;
    }

    .ai-section-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 500;
      color: var(--text-primary);
      font-size: 14px;
    }

    .ai-task-counter {
      font-size: 13px;
      color: var(--secondary-text);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .ai-task-counter::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--accent-primary);
    }

    .ai-task-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Content */
    .ai-tasks-content {
      background: var(--secondary-bg);
      border-radius: 0 0 calc(var(--border-radius) - 1px) calc(var(--border-radius) - 1px);
      padding: 10px 14px;

      /* take remaining space and scroll internally */
      flex: 1 1 auto;
      overflow-y: auto;
    }

    .ai-task-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: 'Roboto Mono', monospace;
      font-size: 14px;
      width: 100%;
    }
    
    .ai-task-tree-item {
      list-style: none;
      margin: 0 0 0 0;
      padding: 0;
      /* Use auto width so indentation doesn't overflow */
      width: auto;
    }
    
    .ai-task-children {
      list-style: none;
      margin: 6px 0 0 0;
      padding: 0;
      width: 100%;
    }

    .ai-task-item {
      display: flex;
      align-items: center;
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background-color: var(--tertiary-bg);
      opacity: 0;
      transform: translateY(10px);
      transition: background-color 0.3s ease, opacity 0.4s ease, transform 0.4s ease;
      position: relative;
      overflow: hidden;
    }
      
    .task-item-content {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }

    .ai-task-item::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      width: 3px;
      height: 100%;
      background-color: var(--accent-primary);
      border-top-left-radius: 6px;
      border-bottom-left-radius: 6px;
    }

    .ai-task-item.show {
      opacity: 1;
      transform: translateY(0);
    }

    .ai-task-item:hover {
      background-color: var(--bg-hover, rgba(255, 255, 255, 0.05));
    }

    .ai-task-checkbox {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text);
      margin-top: 1px;
      margin-left: 0;
    }
    
    .ai-task-text {
      flex-grow: 1;
      word-break: break-word;
    }

    /* completed */
    .completed .ai-task-checkbox {
      color: var(--success-color);
    }

    .completed .ai-task-text {
      text-decoration: line-through;
      opacity: 0.7;
    }

    /* in-progress */
    .in-progress .ai-task-checkbox svg {
      animation: pulse 1.5s infinite;
      transform-origin: center;
    }

    @keyframes pulse {
      0% {
        opacity: 0.7;
        transform: scale(0.9);
      }
      50% {
        opacity: 1;
        transform: scale(1.2);
      }
      100% {
        opacity: 0.7;
        transform: scale(0.9);
      }
    }

    /* error */
    .error .ai-task-checkbox {
      color: var(--error-color);
    }
  `;
    // ------------------ state ------------------
    tasks = [];
    pinned = false;
    /**
     * For hierarchical mode: tasks is an array of root tasks, each may have children:[] recursively.
     * We keep a flat map for FLIP animation and direct id lookups (for add/remove/edit).
     */
    _taskMap = new Map(); // id -> task
    _collapsedMap = new Map(); // id -> collapsed bool
    _orderMap = /* @__PURE__ */ new Map();
    _orderCounter = 0;
    // ------------------ internal animation / operation queue ------------------
    /**
     * Queue that ensures visual operations (add / remove / update) are executed
     * one after another so that their CSS transitions can play without being
     * interrupted by subsequent mutations. Public mutating API methods push
     * their logic as async callbacks into this FIFO queue. Each callback awaits
     * the component's `updateComplete` promise (from LitElement) and then waits
     * for the transition time of a single item so that the next operation only
     * starts once the UI has finished animating.
     */
    _opQueue = [];
    _processing = false;
    /** Approximate time for the entry / exit transition of a task item (ms). */
    static _ANIMATION_MS = 450;
    /**
     * Push an operation onto the internal queue.
     */
    _enqueue(op) {
        return new Promise((resolve, reject) => {
            const wrapped = async () => {
                try {
                    await op();
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            this._opQueue.push(wrapped);
            if (!this._processing) {
                void this._dequeue();
            }
        });
    }
    async _dequeue() {
        const next = this._opQueue.shift();
        if (!next) {
            this._processing = false;
            return;
        }
        this._processing = true;
        await next();
        await this._dequeue();
    }
    // ------------------ public API ------------------
    /**
     * Adds a task to the end of the list. Resolves when the entry animation has
     * finished.
     */
    /**
     * Renormalizes order counter when it approaches MAX_SAFE_INTEGER
     */
    _renormalizeOrderMapIfNeeded() {
        if (this._orderCounter >= Number.MAX_SAFE_INTEGER - 1) {
            console.warn("TaskTrackerWidget: Renormalizing order counter.");
            const currentOrder = this.tasks.map((task) => task.id);
            this._orderMap.clear();
            currentOrder.forEach((id, index) => {
                this._orderMap.set(id, index);
            });
            this._orderCounter = currentOrder.length;
        }
    }
    /**
     * Add a task to the widget. If the task object contains a `parentId`
     * property, the new task is inserted as a child of that parent instead of
     * being appended to the root list.  The parent **must** already be known to
     * the widget (added previously or part of `setTasks`).
     */
    addTask(t5) {
        return this._enqueue(async () => {
            if (this._taskMap.has(t5.id)) {
                console.warn(`TaskTrackerWidget: Task with ID ${t5.id} already exists. Ignoring add operation.`);
                await this._wait(10);
                return;
            }
            this._renormalizeOrderMapIfNeeded();
            const order = this._orderCounter++;
            this._orderMap.set(t5.id, order);
            // -------------------------------------------------------------
            // Decide where to place the task: root list vs. parent's children
            // -------------------------------------------------------------
            let isRootInsertion = true;
            if (t5.parentId) {
                const parent = this._taskMap.get(t5.parentId);
                if (parent) {
                    parent.children ??= [];
                    parent.children.push(t5);
                    isRootInsertion = false;
                } else {
                    console.warn(`TaskTrackerWidget: parentId ${t5.parentId} not found. Adding ${t5.id} as root task.`);
                }
            }
            if (isRootInsertion) {
                this.tasks = [...this.tasks, t5];
                // Only sort the *root* list; children keep their order.
                this._sortTasks();
            }
            // Register in lookup map so that future subtasks can find it.
            this._taskMap.set(t5.id, t5);
            this.requestUpdate();
            await this.updateComplete;
            const newItem = this.renderRoot.querySelector(`#${CSS.escape(t5.id)}`);
            if (newItem) {
                await this._waitForTransition(newItem);
            } else {
                await this._wait(_TaskTrackerWidget._ANIMATION_MS);
            }
        });
    }
    /**
     * Removes the task with the given id with a fade‑out animation to keep
     * parity with the add animation.
     */
    // --- enhanced removal: deletes entire subtree and cleans maps ---
    _removeSubtree(arr, targetId) {
      for (let i = 0; i < arr.length; i++) {
        const node = arr[i];
        if (node.id === targetId) {
          return arr.splice(i, 1)[0];
        }
        if (node.children?.length) {
          const removed = this._removeSubtree(node.children, targetId);
          if (removed) {
            if (node.children.length === 0) delete node.children;
            return removed;
          }
        }
      }
      return null;
    }
    _gatherIds(task, out) {
      out.push(task.id);
      task.children?.forEach(c => this._gatherIds(c, out));
    }
    removeTask(id) {
      return this._enqueue(async () => {
        await this.updateComplete;
        const removed = this._removeSubtree(this.tasks, id);
        if (!removed) {
          console.warn(`TaskTrackerWidget: removeTask – id ${id} not found.`);
          return;
        }
        const ids = [];
        this._gatherIds(removed, ids);
        ids.forEach(tid => {
          this._taskMap.delete(tid);
          this._orderMap.delete(tid);
        });
        // fade-out root of removed subtree if present
        const li = this.renderRoot.querySelector(`li[id="${id}"]`);
        if (li) {
          const taskItem = li.querySelector('.ai-task-item');
          if (taskItem) {
            taskItem.classList.remove("show");
            await this._nextFrame();
            await this._waitForTransition(taskItem);
          } else {
            await this._wait(_TaskTrackerWidget._ANIMATION_MS);
          }
        } else {
          await this._wait(_TaskTrackerWidget._ANIMATION_MS);
        }
        this.requestUpdate();
        await this.updateComplete;
      });
    }
    /** Renames a task. Visual change is instant but still queued for ordering. */
    renameTask(id, text) {
        return this._enqueue(async () => {
            this._patch(id, { text });
            await this.updateComplete;
            await this._wait(80);
        });
    }
    /** Updates the status of a task. */
    setStatus(id, status) {
        return this._enqueue(async () => {
            await this.updateComplete;
            const before = this._collectRects();
            this._patch(id, { status });
            this._sortTasks();
            this.requestUpdate();
            await this.updateComplete;
            const after = this._collectRects();
            this._animateFLIP(before, after);
            await this._wait(_TaskTrackerWidget._ANIMATION_MS);
        });
    }
    /** Clears the list. Used mostly by the demo. */
    clearAll() {
        return this._enqueue(async () => {
            await this.updateComplete;
            const itemsToAnimate = Array.from(this.renderRoot.querySelectorAll(".ai-task-item.show"));
            this.tasks = [];
            this._orderMap.clear();
            this._orderCounter = 0;
            this.requestUpdate();
            await this.updateComplete;
            if (itemsToAnimate.length > 0) {
                const allTransitions = Promise.all(
                    itemsToAnimate.map((el) => {
                        el.style.transition = "";
                        el.classList.remove("show");
                        return this._waitForTransition(el);
                    })
                );
                await allTransitions;
            }
        });
    }
    getTasks() {
        return [...this.tasks];
    }

    togglePin() {
        this.pinned = !this.pinned;
        this.requestUpdate();
    }

    /**
     * Sets the entire task list directly, bypassing the animation queue.
     * This provides an immediate, non-animated update to the displayed tasks.
     * The order of tasks in the input array determines their initial
     * insertion order for sorting purposes.
     *
     * @param {Array<Object>} newTasks The complete array of tasks to display.
     * Each task object should have at least `id`, `text`, and `status` properties.
     * Example: [{ id: 't1', text: 'Do stuff', status: 'pending' }]
     */
    /**
     * Set the entire (possibly nested) task list.
     * @param {Array} newTasks Roots.
     */
    setTasks(newTasks) {
        if (!Array.isArray(newTasks)) {
            console.error('TaskTrackerWidget.setTasks: Input must be an array.');
            return;
        }
        this._orderMap.clear();
        this._orderCounter = 0;
        this._taskMap.clear();
        // Recursively build task map and order for FLIP+lookup
        const buildMaps = (tasks, depth = 0) => {
            tasks.forEach((task, idx) => {
                if (!task || task.id == null) return;
                this._taskMap.set(task.id, task);
                if (!this._orderMap.has(task.id)) this._orderMap.set(task.id, this._orderCounter++);
                if (task.children && Array.isArray(task.children)) buildMaps(task.children, depth + 1);
            });
        };
        buildMaps(newTasks, 0);
        this.tasks = [...newTasks];
        // This is hierarchical so we won't sort here; render tree as is.
        this.requestUpdate();
    }

    // Utility helpers for timing ------------------------------------------------
    _wait(ms) {
        return new Promise((r5) => setTimeout(r5, ms));
    }
    /**
     * Resolves on the next animation frame.
     */
    _nextFrame() {
        return new Promise((r5) => requestAnimationFrame(() => r5(null)));
    }
    /**
     * Waits for the next 'transitionend' event on the given element.
     * Includes a timeout for safety in case the event doesn't fire.
     */
    _waitForTransition(el, timeoutMs = _TaskTrackerWidget._ANIMATION_MS + 100) {
        return new Promise((resolve) => {
            let resolved = false;
            const listener = (event) => {
                if (event.target === el && (event.propertyName === "opacity" || event.propertyName === "transform")) {
                    if (!resolved) {
                        resolved = true;
                        el.removeEventListener("transitionend", listener);
                        clearTimeout(timeoutId);
                        resolve();
                    }
                }
            };
            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn("TaskTrackerWidget: Transition timed out for element:", el);
                    el.removeEventListener("transitionend", listener);
                    resolve();
                }
            }, timeoutMs);
            el.addEventListener("transitionend", listener);
        });
    }
    // ------------------ render ------------------
    render() {
        const completed = this._countCompleted(this.tasks);
        const total = this._countTotal(this.tasks);
        return x`
      <section class="ai-tasks-section">
        <header class="ai-section-header">
          <div class="ai-section-title">
            ${this._icon("pending", true)}
            Tasks
          </div>
          <div class="ai-task-controls">
            <span class="ai-task-counter">${completed}/${total} completed</span>
            <button class="secondary-button icon-button" title="Toggle Pin" @click=${() => this.togglePin()}>
              <span class="material-icons" style=${this.pinned ? '' : 'transform: rotate(45deg);'}>push_pin</span>
            </button>
          </div>
        </header>
        <div class="ai-tasks-content">
          <ul class="ai-task-list">
            ${this._renderTaskTree(this.tasks, 0)}
          </ul>
        </div>
      </section>
    `;
    }
    // ------------------ helpers ------------------
    _patch(id, patch) {
        // Use the flat map to locate the task anywhere in the tree and mutate
        // it in place. This ensures updates work for nested tasks as well.
        const task = this._taskMap.get(id);
        if (task) {
            Object.assign(task, patch);
            this.requestUpdate();
        }
    }
    /**
     * Sort tasks in-place according to status + insertion order.
     */
    static STATUS_WEIGHT = {
        completed: 0,
        "in-progress": 1,
        pending: 2,
        error: 3
    };
    _sortTasks() {
        this.tasks = [...this.tasks].sort((a3, b3) => {
            const wA = _TaskTrackerWidget.STATUS_WEIGHT[a3.status] ?? 99;
            const wB = _TaskTrackerWidget.STATUS_WEIGHT[b3.status] ?? 99;
            if (wA !== wB) return wA - wB;
            const oA = this._orderMap.get(a3.id) ?? 0;
            const oB = this._orderMap.get(b3.id) ?? 0;
            return oA - oB;
        });
    }
    // ------------------ FLIP animation helpers ------------------
    /** Capture the bounding rect (top) of all list items keyed by id */
    _collectRects() {
        const map = /* @__PURE__ */ new Map();
        const items = this.renderRoot.querySelectorAll(".ai-task-tree-item");
        items.forEach((el) => {
            if (el.id) {
                map.set(el.id, el.getBoundingClientRect());
            }
        });
        return map;
    }
    _animateFLIP(before, after) {
        after.forEach((rectAfter, id) => {
            const rectBefore = before.get(id);
            if (!rectBefore) return;
            const dx = rectBefore.left - rectAfter.left;
            const dy = rectBefore.top - rectAfter.top;
            if (dx === 0 && dy === 0) return;
            const el = this.renderRoot.querySelector(`#${CSS.escape(id)}`);
            if (!el) return;
            el.style.transition = "none";
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            void el.getBoundingClientRect();
            el.style.transition = "";
            el.style.transform = "";
        });
    }
    _renderTaskTree(tasks, depth) {
        if (!Array.isArray(tasks)) return null;
        return tasks.map(task => this._taskTreeItem(task, depth));
    }

    _taskTreeItem(task, depth) {
        const isCollapsed = this._collapsedMap.get(task.id);
        const hasChildren = task.children && task.children.length > 0;
        const liClass = `ai-task-item show ${task.status}`;
        const style = `margin-left: ${depth * 22}px;`;
        
        // Each task is its own visual box, regardless of nesting
        return x`
      <li id=${task.id} style=${style} class="ai-task-tree-item">
        <div class=${liClass}>
          <div class="task-item-content">
            ${hasChildren ? x`<span class="ai-task-chevron" @click=${() => this._toggleCollapse(task.id)}>${isCollapsed ? this._chevronRightIcon() : this._chevronDownIcon()}</span>` : null}
            <span class="ai-task-checkbox">${this._icon(task.status)}</span>
            <span class="ai-task-text">${task.title || task.text || 'Untitled Task'}</span>
          </div>
        </div>
        ${hasChildren && !isCollapsed ? x`<ul class="ai-task-children">${this._renderTaskTree(task.children, depth + 1)}</ul>` : null}
      </li>
    `;
    }

    _toggleCollapse(id) {
        this._collapsedMap.set(id, !this._collapsedMap.get(id));
        this.requestUpdate();
    }

    _chevronDownIcon() {
        return x`<svg width="13" height="13" viewBox="0 0 24 24" style="vertical-align: middle;"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none"/></svg>`;
    }
    _chevronRightIcon() {
        return x`<svg width="13" height="13" viewBox="0 0 24 24" style="vertical-align: middle;"><path d="M10 7l5 5-5 5" stroke="currentColor" stroke-width="2" fill="none"/></svg>`;
    }

    _countCompleted(tasks) {
        let n = 0;
        for (const t of tasks) {
            if (t.status === 'completed') n++;
            if (t.children && t.children.length) n += this._countCompleted(t.children);
        }
        return n;
    }
    _countTotal(tasks) {
        let n = 0;
        for (const t of tasks) {
            n++;
            if (t.children && t.children.length) n += this._countTotal(t.children);
        }
        return n;
    }
    _icon(status, mini = false) {
        const size = mini ? 14 : 18;
        switch (status) {
            case "completed":
                return x`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 14.59-3.3-3.3 1.42-1.42L11 13.76l4.88-4.88 1.42 1.42L11 16.59Z"/></svg>`;
            case "in-progress":
                return x`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>`;
            case "error":
                return x`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V6h2v7Z"/></svg>`;
            default:
                return x`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`;
        }
    }
};
if (!customElements.get("task-tracker-widget")) {
    customElements.define("task-tracker-widget", TaskTrackerWidget);
}
export {
    TaskTrackerWidget
};
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/lit-html.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-element/lit-element.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directive.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directive-helpers.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directives/repeat.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
