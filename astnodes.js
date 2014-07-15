// namespace for AST node constructors
// nodes implement `toSnippet(ctx)`
var NODE = {};

function LocatedError(msg, location, path) {
    this.msg = msg;
    this.location = location || null; // NODE.Verbatim
    this.path = path || null;
}

NODE.Verbatim = function (value, lo, hi, token) {
    this.value = value;
    this.lo = lo; // src start index
    this.hi = hi; // src end index (exclusive)
    this.token = token || null;
    this.jsLo = 0; // target start index in transpiled code
    this.jsHi = 0;
};
NODE.Verbatim.prototype.toString = function () {
    return this.value;
};
NODE.Verbatim.prototype.toSnippet = function (ctx) {
    var s = new Snippet(ctx.getType(TypeKeys.UNIT));
    s.append(this);
    return s;
};

NODE.LitBool = function (v) {
    this.v = v; // verbatim node
};
NODE.LitBool.prototype.toSnippet = function (ctx) {
    var s = new Snippet(ctx.getType(TypeKeys.BOOL));
    s.append(this.v);
    return s;
};

NODE.LitChar = function (v) {
    this.v = v; // verbatim node
};
NODE.LitChar.prototype.toSnippet = function (ctx) {
    var s = new Snippet(ctx.getType(TypeKeys.CHAR));
    s.append(this.v);
    return s;
};

NODE.LitInt = function (v) {
    this.v = v; // verbatim node
};
NODE.LitInt.prototype.toSnippet = function (ctx) {
    var s = new Snippet(ctx.getType(TypeKeys.INT));
    s.append(this.v);
    return s;
};

NODE.LitStr = function (v) {
    this.v = v; // verbatim node
};
NODE.LitStr.prototype.toSnippet = function (ctx) {
    var s = new Snippet(ctx.getType(TypeKeys.STR));
    s.append(this.v);
    return s;
};

NODE.Ident = function (v, isAnnotation) {
    this.v = v; // verbatim node
    this.isAnnotation = isAnnotation || false; // used for self or type annotations to avoid .getFresh (see toSnippet below)
};
NODE.Ident.prototype.toSnippet = function (ctx) {
    var is_mod = (this.v.token && this.v.token.is_mod);

    if (is_mod) {
        var mod = ctx.getMod(this.v.value);
        if (mod !== null) {
            var s = new Snippet(ctx.getType(TypeKeys.UNIT));
            s.context = ctx.getModChild(this.v.value);
            s.append(this.v);
            return s;
        }
    }

    var typ;
    if (this.isAnnotation) {
        typ = ctx.getType(this.v.value);
        if (typ !== null) {
            var s = new Snippet(this.isAnnotation ? typ : typ.getFresh()); // don't getFresh if annotation
            s.context = ctx.getTypeChild(this.v.value);
            s.append(this.v);
            return s;
        }
    }

    var ident = ctx.getIdent(this.v.value);
    var isMacro = this.v.value.endsWith('!');
    if (ident !== null) {
        var s = new Snippet(ident.getFresh());
        s.context = ctx.getIdentChild(this.v.value);
        if (isMacro) {
            s.append("MACRO['");
            s.append(this.v);
            s.append("']");
        } else {
            s.append(this.v);
        }
        return s;
    }

    // could be struct name
    typ = ctx.getType(this.v.value);
    if (typ !== null) {
        var s = new Snippet(typ.getFresh()); // TODO .getFresh here?
        s.context = ctx.getTypeChild(this.v.value);
        s.append(this.v);
        return s;
    }

    throw new LocatedError("unknown identifier " + this.v.value, this.v);
};

NODE.As = function (v, a, b) {
    this.a = a;
    this.v = v;
    this.b = b;
};
NODE.As.prototype.toSnippet = function (ctx) {
    var aSnippet = this.a.toSnippet(ctx);
    var bType = this.b.toType(ctx).getFresh();

    var s = new Snippet(bType); // TODO type checker should validate compatibility of this type conversion
    s.appendSnippet(aSnippet);
    return s;
};

NODE.Operator = function (c, v, arity, rightAssoc, prec) { // wrapper for unary/binary constructor
    this.opConstructor = c;
    this.opVerbatim = v;
    this.arity = arity;
    this.rightAssoc = rightAssoc || false;
    this.prec = prec || 1;
};
NODE.Operator.prototype.toSnippet = function (ctx) {
    throw new LocatedError('wrapper node, not a concrete node (use `exprToAST` first)', this.opVerbatim);
};

NODE.CmpOp = function (v, a, b) { // comparison operator
    this.a = a;
    this.v = v;
    this.b = b;
};
NODE.CmpOp.prototype.toSnippet = function (ctx) { // transform to BinaryOp but resulting expr should be bool
    var s = new NODE.BinaryOp(this.v, this.a, this.b).toSnippet(ctx);
    s.exprType = ctx.getType(TypeKeys.BOOL);
    return s;
};

NODE.BinaryOp = function (v, a, b) {
    this.a = a;
    this.v = v;
    this.b = b;
};
NODE.BinaryOp.prototype.toString = function () {
    var res = [];
    res.push(this.a.constructor === NODE.Verbatim ? this.a.value : this.a.toString());
    if (this.v !== null) res.push(this.v.value);
    res.push(this.b.constructor === NODE.Verbatim ? this.b.value : this.b.toString());
    return "(" + res.join(' ') + ")";
};
NODE.BinaryOp.prototype.toSnippet = function (ctx) { // operator might be overloaded; unify(lhs, rhs) and don't conclude their type even shift operators; exception comparison operators which have to return bool
    var aSnippet = this.a.toSnippet(ctx);
    var bSnippet = this.b.toSnippet(ctx);

    try { unify(bSnippet.exprType, aSnippet.exprType); }
    catch (e) { throw new LocatedError("Type checking failed: (binary operand types mismatch) " + e, this.v); }

    var s = new Snippet(aSnippet.exprType);
    s.appendSnippet(aSnippet);
    s.append(' ');
    s.append(this.v);
    s.append(' ');
    s.appendSnippet(bSnippet);
    return s;
};

NODE.UnaryOp = function (v, a) {
    this.v = v;
    this.a = a;
};
NODE.UnaryOp.prototype.toString = function () { // displayed as right assoc - ish
    var res = [];
    if (this.v !== null) res.push(this.v.value);
    res.push(this.a.constructor === NODE.Verbatim ? this.a.value : this.a.toString());
    return "(" + res.join(' ') + ")";
};
NODE.UnaryOp.prototype.toSnippet = function (ctx) { // don't conclude types (eg ! on bool might not be always true because of operator overloading)
    var aSnippet = this.a.toSnippet(ctx);

    var s = new Snippet(aSnippet.exprType);
    s.append(this.v);
    s.appendSnippet(aSnippet);
    return s;
};

NODE.TrailingNot = function (v, a) { // converts ident to ident w/ trailing ! making it macro identifier
    if (a.constructor !== NODE.Ident) {
        throw new LocatedError('suffix `!` for a macro can only occur after identifier', v);
    }

    var verbatim = new NODE.Verbatim(a.v.value + v.value, a.v.lo, v.hi); // extend lo, hi and modify name

    return new NODE.Ident(verbatim, a.isAnnotation);
};

NODE.GenericArray = function (x) {
    this.children = x; // [, items, ]
};
NODE.GenericArray.prototype.toSnippet = function (ctx) {
    var genericArrayType = new TypeOperator('[]');
    var genericType = new TypeVariable('T');
    genericArrayType.generics.push(genericType);

    var typ = genericArrayType.getFresh();
    var s = new Snippet(typ);
    s.append(this.children[0]);
    for (var i = 0; i < this.children[1].length; i++) {
        var elSnippet = this.children[1][i].toSnippet(ctx);
        try { unify(elSnippet.exprType, typ.generics[0]); }
        catch (e) { throw new LocatedError("Type checking failed: (array element type mismatch) " + e, elSnippet.getLastVerbatim() || this.children[0]); }
        if (i !== 0) s.append(', ');
        s.appendSnippet(elSnippet);
    }
    s.append(this.children[2]);
    return s;
};

NODE.Tuple = function (x) {
    this.children = x;
};
NODE.Tuple.prototype.toSnippet = function (ctx) {
    var types = [];

    var s = new Snippet();

    if (this.children[1].length === 0) {
        s.exprType = ctx.getType(TypeKeys.UNIT);
        s.append('null', [this.children[0], this.children[2]]);
    } else if (this.children[1].length === 1) {
        var exprSnippet = this.children[1][0].toSnippet(ctx);
        s.exprType = exprSnippet.exprType;

        s.append('(', this.children[0]);
        s.appendSnippet(exprSnippet);
        s.append(')', this.children[2]);
    } else {
        s.append('[', this.children[0]);
        for (var i = 0; i < this.children[1].length; i++) {
            var argSnippet = this.children[1][i].toSnippet(ctx);
            types.push(argSnippet.exprType);
            if (i !== 0) s.append(', ');
            s.appendSnippet(argSnippet);
        }
        s.append(']', this.children[2]);

        s.exprType = new TypeOperator('tuple', types);
    }

    return s;
};

NODE.CallTuple = function (values) { // function call args
    this.values = values;
};
NODE.CallTuple.prototype.toSnippet = function (ctx) {
    var types = [];

    var s = new Snippet();
    s.append('(');
    for (var i = 0; i < this.values.length; i++) {
        var argSnippet = this.values[i].toSnippet(ctx);
        types.push(argSnippet.exprType);
        if (i !== 0) s.append(', ');
        s.appendSnippet(argSnippet);
    }
    s.append(')');

    s.exprType = new TypeOperator('calltuple', types);

    return s;
};

NODE.Apply = function (v, fn, arg) {
    this.fn = fn;
    this.v = null; // null because there is no apply operator, reqd because of exprToAST
    this.arg = arg;
};
NODE.Apply.prototype.toSnippet = function (ctx) {
    var fnSnippet = this.fn.toSnippet(ctx);

    if (fnSnippet.context !== null && (fnSnippet.context.classification === 'type'/* ||
      (fnSnippet.context.classification === 'ident' && fnSnippet.exprType.name !== '->')*/)) {
        // convert to TupleStruct node
        var transformed = new NODE.TupleStruct(fnSnippet, fnSnippet.exprType, this.arg.values);
        return transformed.toSnippet(ctx);
    }

    var argSnippet = this.arg.toSnippet(ctx);

    var resultType =  new TypeVariable();
    if (fnSnippet.exprType.types && fnSnippet.exprType.types.length > 1 && fnSnippet.exprType.types[1] === null) {
        resultType = null;
    }
    var t = new TypeOperator('->', [argSnippet.exprType, resultType]);
    t.generics = fnSnippet.exprType.generics || [];
    try { unify(t, fnSnippet.exprType); }
    catch (e) { throw new LocatedError("Type checking failed: (function arguments) " + e, fnSnippet.getLastVerbatim()); }

    var s = new Snippet(resultType);
    s.appendSnippet(fnSnippet);
    s.appendSnippet(argSnippet);
    return s;
};

NODE.ApplyMacro = function (v, fn, arg) {
    this.fn = fn;
    this.v = null; // null because there is no apply operator, reqd because of exprToAST
    this.arg = arg;
};
NODE.ApplyMacro.prototype.toSnippet = function (ctx) {
    if (this.fn.constructor !== NODE.Ident) {
        throw 'macro with qualified name not supported'; // TODO macro must be importable
    }

    var macroName = this.fn.v.value;
    if (ctx.getIdent(macroName) === null) { // if not found, assume
        var macroType = new TypeOperator('MACRO');
        assumeProperty(macroType, macroName);
        ctx.setIdent(macroName, macroType.properties[macroName]);
    }

    return new NODE.Apply(this.v, this.fn, this.arg).toSnippet(ctx);
};

NODE.ModProperty = function (v, lhs, rhs) { // left associative
    this.lhs = lhs;
    this.v = v; // verbatim (operator '::')
    this.rhs = rhs;
};
NODE.ModProperty.prototype.toSnippet = function (ctx) {
    var lhsSnippet = this.lhs.toSnippet(ctx);
    var newCtx = lhsSnippet.context;
    if (newCtx === null) {
        throw new LocatedError("identifier chain could not be resolved", this.v);
    }

    if (this.rhs.constructor !== NODE.Ident) { // generic hint (its an Array of types)
        if (lhsSnippet.context.classification === 'mod') {
            throw new LocatedError("cannot apply generic on mod", this.v);
        }
        var typ = lhsSnippet.exprType;
        if (typ.generics.length < this.rhs.length) {
            throw new LocatedError("too many generic parameters", this.v);
        }
        for (var j = 0; j < this.rhs.length; j++) {
            try { unify(typ.generics[j], this.rhs[j].toType(ctx)); } // NOT newCtx
            catch (e) { throw new LocatedError("Type checking failed: (generic parameter) " + e, this.v); }
        }
        lhsSnippet.context = null; // don't allow chain anymore
        return lhsSnippet;
    }

    var rhsSnippet = this.rhs.toSnippet(newCtx);

    var s = new Snippet(rhsSnippet.exprType);
    s.context = rhsSnippet.context;
    s.appendSnippet(lhsSnippet);
    s.append('.', this.v); // ::
    s.appendSnippet(rhsSnippet);
    return s;
};

NODE.Property = function (v, obj, name) {
    if (name.constructor !== NODE.Ident) {
        throw new LocatedError("property is expected to be an identifier", v);
    }

    this.obj = obj;
    this.v = v; // verbatim (operator '.')
    this.name = name.v;
};
NODE.Property.prototype.toSnippet = function (ctx) {
    var objSnippet = this.obj.toSnippet(ctx);
    var objType = pruneToProperty(objSnippet.exprType); // pruning is important to add properties on correct type otherwise updates will get lost

    var propName = this.name.toString(); // gets name.value
    if (!objType.properties.hasOwnProperty(propName)) {
        assumeProperty(objType, propName);
    }

    var s = new Snippet(objType.properties[propName]);
    s.appendSnippet(objSnippet);
    s.append(this.v); // .
    s.append(this.name);
    return s;
};

NODE.Struct = function (values, name) { // struct instantiator, acts as unary operator on values
    this.name = name; // P1
    this.valueMap = {};
    for (var i = 0; i < values.length; i++) {
        this.valueMap[values[i][0].value] = values[i];
    }
};
NODE.Struct.prototype.toSnippet = function (ctx) {
    //var structType = ctx.getType(this.name.v.value).getFresh();
    var nameSnippet = this.name.toSnippet(ctx);
    var structType = nameSnippet.exprType;

    // TODO should missing struct fields be checked (iterate over structType.properties instead?)
    var values = [];
    var t = pruneToProperty(structType); // prune for accessing properties on enum
    for (var k in this.valueMap) {
        var fieldSnippet = this.valueMap[k][1].toSnippet(ctx);
        try { unify(fieldSnippet.exprType, t.properties[k]); }
        catch (e) { throw new LocatedError("Type checking failed: (struct field) " + e, this.valueMap[k][0]); }
        values.push([this.valueMap[k][0], fieldSnippet]);
    }

    var s = new Snippet(structType);
    s.append('new ');
    s.appendSnippet(nameSnippet); //s.append(this.name.v);
    s.append('({\n');
    var inside = new Snippet();
    for (var i = 0; i < values.length; i++) {
        if (i !== 0) inside.append(',\n');
        inside.append(values[i][0]);
        inside.append(': ');
        inside.appendSnippet(values[i][1]);
    }
    if (!inside.isEmpty()) {
        inside.indent();
        inside.append('\n');
    }
    s.appendSnippet(inside);
    s.append('})');
    return s;
};

NODE.TupleStruct = function (s, t, values) {
    this.nameSnippet = s; // NODE.Ident
    this.exprType = t;
    this.values = values;
};
NODE.TupleStruct.prototype.toSnippet = function (ctx) {
    var structType = this.exprType.getFresh();

    var s = new Snippet(structType);

    if (this.values.length === 0) {
        s.appendSnippet(this.nameSnippet);
        return s;
    }

    // TODO should missing struct fields be checked (iterate over structType.properties instead?)
    var values = [];
    var t = pruneToProperty(structType); // prune for accessing properties on enum
    for (var k = 0; k < this.values.length; k++) {
        var fieldSnippet = this.values[k].toSnippet(ctx);
        try { unify(fieldSnippet.exprType, t.properties[k]); }
        catch (e) { throw new LocatedError("Type checking failed: (struct field) " + e, fieldSnippet.getLastVerbatim()); }
        values.push(fieldSnippet);
    }

    s.append('new ');
    s.appendSnippet(this.nameSnippet);
    s.append('(');
    var inside = new Snippet();
    for (var i = 0; i < values.length; i++) {
        if (i !== 0) inside.append(', ');
        inside.appendSnippet(values[i]);
    }
    s.appendSnippet(inside);
    s.append(')');
    return s;
};

NODE.Closure = function (args, expr) {
    this.args = args; // list of ident
    this.expr = expr;
};
NODE.Closure.prototype.toSnippet = function (ctx) {
    var newCtx = new Context(ctx); // thunk context, therefore instantiation via new instead of via newXChild

    var types = [];
    var argSnippet = new Snippet();
    for (var i = 0; i < this.args.length; i++) {
        var t = new TypeVariable();
        types.push(t);
        if (i !== 0) {
            argSnippet.append(', ');
        }
        newCtx.setIdent(this.args[i].value, t); // add fn args to env
        argSnippet.append(this.args[i]);
    }
    argSnippet.exprType = new TypeOperator('calltuple', types);

    var exprSnippet = this.expr.toSnippet(newCtx);

    var fnType = new TypeOperator('->', [argSnippet.exprType, exprSnippet.exprType]);

    var s = new Snippet(fnType);
    s.append('function(');
    s.appendSnippet(argSnippet);
    s.append('){');
    s.appendSnippet(exprSnippet);
    s.append('}');
    return s;
};

NODE.Let = function (x) {
    this.children = x;
};
NODE.Let.prototype.toSnippet = function (ctx) {
    var lhsType = this.children[2].toType(ctx); // children[2] is type annotation

    var isDesSingle = this.children[1].constructor === NODE.DesSingle; // lhs node is a des node
    var hasRhs = this.children[3] !== null;

    // introduced variable
    var x = (hasRhs && !isDesSingle) ? newvar() : null;

    // destructured
    var des = this.children[1].destructure(ctx)(isDesSingle ? (hasRhs ? this.children[3][1] : null) : x);
    try { unify(des[1], lhsType); }
    catch (e) { throw new LocatedError("Type checking failed: (lhs) " + e, this.children[3][0]); }

    var s = new Snippet(ctx.getType(TypeKeys.UNIT));

    // warning: crafty `if` `else` blocks ahead 
    // added just to avoid repetition; not sure if worth it or unreadable
    if (isDesSingle || hasRhs) {
        s.append('var', this.children[0]); // let
        s.append(' ');
    }

    if (isDesSingle) {
        s.append(this.children[1].node.v);
        ctx.setIdent(this.children[1].node.v.value, lhsType);
    } else if (hasRhs) {
        s.append(x);
    }

    if (hasRhs) {
        s.append(' ');
        s.append(this.children[3][0]); // =
        s.append(' ');

        var rhsSnippet = this.children[3][1].toSnippet(ctx);
        try { unify(rhsSnippet.exprType, lhsType); }
        catch (e) { throw new LocatedError("Type checking failed: (rhs) " + e, this.children[3][0]); }
        s.appendSnippet(rhsSnippet);
    }

    if (isDesSingle || hasRhs) {
        s.append(this.children[4]); // ;
    }

    if (!isDesSingle) {
        for (var i = 0; i < des[2].length; i++) { // ignore condition (des[0])
            if (!s.isEmpty()) {
                s.append('\n');
            }
            s.append('var ');
            s.append(des[2][i][0]);
            if (des[2][i][2] !== null) {
                s.append(" = " + des[2][i][2]);
            }
            s.append(';');
            ctx.setIdent(des[2][i][0], des[2][i][1]);
        }
    }

    return s;
};

NODE.LastExpr = function (x) {
    this.node = x;
};
NODE.LastExpr.prototype.toSnippet = function (ctx) {
    var exprSnippet = this.node.toSnippet(ctx);
    var s = new Snippet(exprSnippet.exprType);
    s.tail = exprSnippet;
    return s;
};

NODE.LastStmt = function (x) {
    this.node = x;
};
NODE.LastStmt.prototype.toSnippet = function (ctx) {
    var s = this.node.toSnippet(ctx);
    s.append(';'); // ASI?
    return s;
};

NODE.Break = function (x) {
    this.children = x;
};
NODE.Break.prototype.toSnippet = function (ctx) {
    var s = new Snippet();
    s.exprType = null;
    s.append(this.children[0]); // break
    return s;
};

NODE.Continue = function (x) {
    this.children = x;
};
NODE.Continue.prototype.toSnippet = function (ctx) {
    var s = new Snippet();
    s.exprType = null;
    s.append(this.children[0]); // continue
    if (this.children[1] !== null) {
        s.append(' ');
        s.append(this.children[1]); // label
    }
    return s;
};

NODE.Return = function (x) {
    this.children = x;
};
NODE.Return.prototype.toSnippet = function (ctx) {
    var s = new Snippet();

    s.exprType = null; // return have exprType null (and not unit)

    s.append(this.children[0]); // return
    if (this.children[1] !== null) {
        var exprSnippet = this.children[1].toSnippet(ctx);
        try { unify(ctx.returnType, exprSnippet.exprType); }
        catch (e) { throw new LocatedError("Type checking failed: (return type) " + e, this.children[0]); }
        s.append(' ');
        s.appendSnippet(exprSnippet);
    } else {
        try { unify(ctx.returnType, ctx.getType(TypeKeys.UNIT)); }
        catch (e) { throw new LocatedError("Type checking failed: (return type) " + e, this.children[0]); }
    }
    return s;
};

NODE.IfExpr = function (x) { // intermediate if/match (reduce to JS ternary if possible)
    this.node = x; // assert x.constructor === NODE.If | NODE.Match
};
NODE.IfExpr.prototype.toSnippet = function (ctx) {
    if (this.node.constructor === NODE.If &&
      this.node.children.length === 2 &&
      this.node.children[0][3][1].items.length === 1 &&
      this.node.children[0][3][1].items[0].constructor === NODE.LastExpr &&
      this.node.children[1][1] === null && // no  condition
      this.node.children[1][3][1].items.length === 1 &&
      this.node.children[1][3][1].items[0].constructor === NODE.LastExpr) { // can be reduced to ternary
        var condSnippet = this.node.children[0][1].toSnippet(ctx); // assume node because it is not NODE.Match
        try { unify(condSnippet.exprType, ctx.getType(TypeKeys.BOOL)); }
        catch (e) { throw new LocatedError("Type checking failed: (condition) " + e, condSnippet.getLastVerbatim()); }

        var exprType = null;
        var s1 = this.node.children[0][3][1].items[0].node.toSnippet(ctx);
        var s2 = this.node.children[1][3][1].items[0].node.toSnippet(ctx);
        var blockSnippets = [s1, s2];
        for (var i = 0; i < blockSnippets.length; i++) {
            var blockSnippet = blockSnippets[i];
            if (exprType === null) {
                exprType = blockSnippet.exprType;
            } else {
                try { unify(blockSnippet.exprType, exprType); }
                catch (e) { throw new LocatedError("Type checking failed: (block expression mismatch) " + e, blockSnippet.getLastVerbatim()); }
            }
        }
        var s = new Snippet(exprType);
        s.append('(');
        s.appendSnippet(condSnippet);
        s.append(' ? ');
        s.appendSnippet(s1);
        s.append(' : ');
        s.appendSnippet(s2);
        s.append(')');
        return s;
    }

    var node = this.node;
    if (node.constructor === NODE.BareBlock) {
        node = node.block;
    }
    var ifSnippet = node.toSnippet(ctx);

    var s = new Snippet(ifSnippet.exprType);
    s.append('(function(){');
    s.append('\n');
    ifSnippet.indent(); // as a side-effect this adds return
    s.appendSnippet(ifSnippet);
    s.append('\n');
    s.append('})()');
    return s;    
};

NODE.If = function (x) {
    this.children = x; // count of children = count of branches
};
NODE.If.prototype.toSnippet = function (ctx) { // accomodates NODE.Match as well
    var exprType = null;

    var condSnippets = [];
    var blockSnippets = [];
    var hasTail = false;
    for (var i = 0; i < this.children.length; i++) { // an element of the array is [[], E, {, [[ktv], B], }]
        var condSnippet;
        if (this.children[i][1] !== null) { // E is node; or Snippet (so that match node can be converted to if)
            condSnippet = this.children[i][1];
            if (condSnippet.constructor !== Snippet) {
                condSnippet = condSnippet.toSnippet(ctx);
            }
            try { unify(condSnippet.exprType, ctx.getType(TypeKeys.BOOL)); }
            catch (e) { throw new LocatedError("Type checking failed: (condition) " + e, condSnippet.getLastVerbatim()); }
        } else {
            condSnippet = new Snippet();
        }
        condSnippets.push(condSnippet);

        var ktv = this.children[i][3][0];
        var desSnippet = new Snippet();
        for (var j = 0; j < ktv.length; j++) { // destructured items (accomodation for `match`)
            ctx.setIdent(ktv[j][0], ktv[j][1]);
            desSnippet.append('var');
            desSnippet.append(' ');
            desSnippet.append(ktv[j][0]);
            if (ktv[j][2] !== null) {
                desSnippet.append(' = ');
                desSnippet.append(ktv[j][2]);
            }
            desSnippet.append(';');
            if (j !== ktv.length - 1) {
                desSnippet.append('\n');
            }
        }
        var blockSnippet = this.children[i][3][1].toSnippet(ctx);
        if (ktv.length > 0) {
            if (blockSnippet.content.length > 0) {
                desSnippet.append('\n');
            }
            blockSnippet.insertSnippetAt(0, desSnippet);
        }
        if (blockSnippet.exprType !== null) {
            if (exprType === null) {
                exprType = blockSnippet.exprType;
            } else {
                try { unify(blockSnippet.exprType, exprType); }
                catch (e) { throw new LocatedError("Type checking failed: (block expression mismatch) " + e, blockSnippet.getLastVerbatim() || this.children[i][4]); } // TODO a blank block transformed by NODE.Match will have no verbatims
            }
        }
        hasTail = hasTail || (blockSnippet.tail !== null);
        blockSnippets.push(blockSnippet);
    }

    var s = new Snippet(exprType);
    var s1, s2, isLast;
    s.tail = hasTail ? [] : null;
    for (var i = 0; i < this.children.length; i++) {
        var isLast = (i === this.children.length - 1);

        s1 = new Snippet();
        if (i !== 0) {
            s1.append(this.children[i - 1][4]); // }
            s1.append(' ');
        }
        // children[i][0] is prefix, eg, [`if`] or [`else`, `if`]
        for (var j = 0; j < this.children[i][0].length; j++) {
            if (j !== 0) s1.append(' ');
            s1.append(this.children[i][0][j]);
        }
        if (!condSnippets[i].isEmpty()) {
            s1.append(' (');
            s1.appendSnippet(condSnippets[i]);
            s1.append(')');
        }
        s1.append(' ');
        s1.append(this.children[i][2]); // {

        if (hasTail) {
            s.tail.push(s1);
            if (blockSnippets[i].tail === null) {
                blockSnippets[i].indent();
            }
            s.tail.push(blockSnippets[i]);
        } else {
            s.appendSnippet(s1);
            s.append('\n');
            if (!blockSnippets[i].isEmpty()) {
                blockSnippets[i].indent();
                s.appendSnippet(blockSnippets[i]);
                s.append('\n');
            }
        }

        if (isLast) {
            s2 = new Snippet();
            s2.append(this.children[i][4]); // }
            if (hasTail) {
                s.tail.push(s2);
            } else {
                s.appendSnippet(s2);
            }
        }
    }
    return s;
};

NODE.Match = function (e, x) {
    this.e = e;
    this.children = x; // count of children = count of branches
};
NODE.Match.prototype.toSnippet = function (ctx) { // relies on NODE.If for most of the work
    var x = newvar();
    var eSnippet = this.e.toSnippet(ctx);
    var prefixSnippet = new Snippet();
    prefixSnippet.append('var');
    prefixSnippet.append(' ');
    prefixSnippet.append(x);
    prefixSnippet.append(' = ');
    prefixSnippet.appendSnippet(eSnippet);
    prefixSnippet.append(';');

    var items = [];
    for (var i = 0; i < this.children.length; i++) {
        var condSnippet = new Snippet(ctx.getType(TypeKeys.BOOL));
        var des;
        if (this.children[i][0].constructor === Array) { // list of literals
            var litSnippet = this.children[i][0][0].toSnippet(ctx);
            var exprType = null;
            for (var j = 0; j < this.children[i][0].length; j++) {
                var litSnippet = this.children[i][0][j].toSnippet(ctx);
                if (j == 0) {
                    exprType = litSnippet.exprType;
                } else { // unify exprType with other | separated items
                    try { unify(litSnippet.exprType, exprType); }
                    catch (e) { throw new LocatedError("Type checking failed: (match alternatives) " + e, litSnippet.getLastVerbatim()); }
                    condSnippet.append(' || ');
                }
                condSnippet.append(x);
                condSnippet.append(' === ');
                condSnippet.appendSnippet(litSnippet);
            }
            des = [[condSnippet.toString()], exprType, []];
        } else {
            des = this.children[i][0].destructure(ctx)(x);
            for (var j = 0; j < des[0].length; j++) {
                if (j !== 0) {
                    condSnippet.append(' && ');
                }
                condSnippet.append(des[0][0]);
            }
            if (((i !== this.children.length - 1) || (i === 0)) && condSnippet.isEmpty()) {
                condSnippet.append('true');
            }
        }
        try { unify(des[1], eSnippet.exprType); } // unify destructured type with this.e's type
        catch (e) { throw new LocatedError("Type checking failed: (match arm lhs) " + e, eSnippet.getLastVerbatim()); }
        var itemPrefix = i === 0 ? 'if' : ("else" + (condSnippet.isEmpty() ? "": " if"));
        var block = this.children[i][1];
        if (block.constructor === NODE.BareBlock) { // in case of BareBlock extract .block
            block = block.block;
        } else {
            block = new NODE.Block([block]);
        }
        items.push([[itemPrefix], condSnippet, '{', [des[2], block], '}']); // for conversion to If node
    }
    var s = new NODE.If(items).toSnippet(ctx);
    if (s.toString().length > 0) { // as a side effect, consumes tail
        prefixSnippet.append('\n');
    }
    s.insertSnippetAt(0, prefixSnippet);
    return s;
};

NODE.While = function (x) {
    this.children = x; // while, E, {, B, }
    this.label = null;
};
NODE.While.prototype.toSnippet = function (ctx) {
    var condSnippet = this.children[1]; // could be a snippet to accomodate Loop conversion to While
    if (condSnippet.constructor !== Snippet) {
        condSnippet = condSnippet.toSnippet(ctx);
    }
    try { unify(condSnippet.exprType, ctx.getType(TypeKeys.BOOL)); }
    catch (e) { throw new LocatedError("Type checking failed: (condition) " + e, condSnippet.getLastVerbatim()); }

    var blockSnippet = this.children[3].toSnippet(ctx);
    if (blockSnippet.tail !== null) {
        var x = blockSnippet.introduceVariable();
        if (blockSnippet.content.length > 0) {
            blockSnippet.append('\n');
        }
        blockSnippet.append("var " + x + ";");
    }

    var s = new Snippet(ctx.getType(TypeKeys.UNIT));
    if (this.label !== null) {
        for (var i = 0; i < this.label.length; i++) {
            s.append(this.label[i]);
        }
        s.append(' ');
    }
    s.append('while', this.children[0]); // while or loop
    s.append(' (');
    s.appendSnippet(condSnippet);
    s.append(') ');
    s.append(this.children[2]); // {
    s.append('\n');
    if (!blockSnippet.isEmpty()) {
        blockSnippet.indent();
        s.appendSnippet(blockSnippet);
        s.append('\n');
    }
    s.append(this.children[4]); // }
    return s;
};

NODE.Loop = function (x) {
    this.children = x; // loop, {, B, }
    this.label = null;
};
NODE.Loop.prototype.toSnippet = function (ctx) {
    var condSnippet = new Snippet(ctx.getType(TypeKeys.BOOL));
    condSnippet.append('true');

    var w = new NODE.While([this.children[0], condSnippet, this.children[1], this.children[2], this.children[3]]);
    w.label = this.label;
    return w.toSnippet(ctx);
};

NODE.For = function (x) {
    this.children = x; // for,DES,in, E, {, B, }
    this.label = null;
};
NODE.For.prototype.toSnippet = function (ctx) {

    function V(x) { // generates fake verbatim
        return new NODE.Verbatim(x);
    }

    var x = newvar();

    // inject let code
    var itLetNode = new NODE.Let([V('let'), new NODE.DesSingle(null, new NODE.Ident(V(x))), new NODE.TypeMissing(), [V('='), this.children[3]], V(';')]);
    var prefixSnippet = itLetNode.toSnippet(ctx);
    prefixSnippet.append(' // it');

    // inject match
    var matchExprNode = new NODE.Apply(null,
      new NODE.Property(V('.'), new NODE.Ident(V(x)), new NODE.Ident(V('next'))),
      new NODE.CallTuple([]));

    if (ctx.getType('Option') === null) {
        throw new LocatedError('`Option` not found in environment, `for` cannot be transpiled', this.children[0]);
    }

    var matchArms = [];
    matchArms.push([new NODE.DesTupleStruct([this.children[1]], new NODE.Ident(V('Some'))),  this.children[5]]);
    matchArms.push([new NODE.DesSingle(null, new NODE.Ident(V('None'))), new NODE.LastStmt(new NODE.Break([V('break')]))]);

    // transform to `while` node
    var condSnippet = new Snippet(ctx.getType(TypeKeys.BOOL));
    condSnippet.append('true');

    var insideBlock = new NODE.Block([new NODE.Match(matchExprNode, matchArms)]); // block which is repeatedly executed

    var w = new NODE.While([this.children[0], condSnippet, this.children[4], insideBlock, this.children[6]]);
    w.label = this.label;

    var s = w.toSnippet(ctx);
    if (s.toString().length > 0) { // as a side effect, consumes tail
        prefixSnippet.append('\n');
    }
    s.insertSnippetAt(0, prefixSnippet);
    return s;
};

NODE.BareBlock = function (x) {
    this.block = x;
    this.label = null; // this will be ignored in BareBlock
};
NODE.BareBlock.prototype.toSnippet = function (ctx) {
    var blockSnippet = this.block.toSnippet(ctx);
    if (blockSnippet.tail !== null) {
        var x = blockSnippet.introduceVariable();
        if (blockSnippet.content.length > 0) {
            blockSnippet.append('\n');
        }
        blockSnippet.append("var " + x + ";");
    }

    var s = new Snippet(ctx.getType(TypeKeys.UNIT));
    s.appendSnippet(blockSnippet);
    return s;
};

NODE.Fn = function (x) {
    this.children = x; // [fn, ident, GE, (, LFA, ), RT], {, B, }
};
NODE.Fn.prototype.toSnippet = function (ctx, isImpl) { // in case of impl skip function name in the snippet
    isImpl = isImpl || false;

    var fnType = ctx.getIdent(this.children[0][1].value).getFresh(); // don't operate on generics, use getFresh
    var fnReturnType = fnType.types[1];
    var newCtx = ctx.getIdentChild(this.children[0][1].value);
    newCtx.returnType = fnReturnType;

    if (isImpl) { // impl fns are anonymous functions and don't have fn names in scope
        delete(ctx.identEnv[this.children[0][1].value]);
    }

    var argNames = [];
    var desSnippet = new Snippet();
    for (var j = 0; j < this.children[0][4].length; j++) { // an element is [des node or self, TY]
        var argNameNode = this.children[0][4][j][0];
        var x = argNameNode.constructor === NODE.DesSingle ? null : newvar();
        var des = argNameNode.destructure(ctx)(x);
        try { unify(des[1], fnType.types[0].types[j]); } // call tuple's jth element is argType
        catch (e) { throw new LocatedError("Type checking failed: (fn args[" + j + "]) " + e, this.children[0][1]); }
        for (var i = 0; i < des[2].length; i++) {
            newCtx.setIdent(des[2][i][0], des[2][i][1]); // introduce the destructured variable in new env
            if (x === null) {
                continue;
            }

            if (i !== 0) {
                desSnippet.append('\n');
            }
            desSnippet.append('var');
            desSnippet.append(' ');
            desSnippet.append(des[2][i][0]);
            if (des[2][i][2] !== null) {
                desSnippet.append(' = ');
                desSnippet.append(des[2][i][2]);
            }
            desSnippet.append(';');
        }
        argNames.push(x === null ? argNameNode.node.v.value : x);
    }

    // process function block
    var blockSnippet = this.children[2].toSnippet(newCtx);
    if (blockSnippet.exprType !== null) {
        try { unify(fnReturnType, blockSnippet.exprType); }
        catch (e) { throw new LocatedError("Type checking failed: (fn return type) " + e, blockSnippet.getLastVerbatim() || this.children[1]); }
    }
    if (!desSnippet.isEmpty()) {
        if (blockSnippet.content.length > 0) {
            desSnippet.append('\n');
        }
        blockSnippet.insertSnippetAt(0, desSnippet);
    }

    var s = new Snippet(ctx.getType(TypeKeys.UNIT));

    s.append('function', this.children[0][0]); // fn
    if (!isImpl) {
        s.append(' ');
        s.append(this.children[0][1]);
    }
    s.append(this.children[0][3]); // (
    for (var j = 0; j < argNames.length; j++) {
        if (j !== 0) {
            s.append(', ');
        }
        s.append(argNames[j]);
    }
    s.append(this.children[0][5]); // )
    s.append(' ');
    s.append(this.children[1]); // {
    s.append('\n');

    if (!blockSnippet.isEmpty()) {
        blockSnippet.indent();
        s.appendSnippet(blockSnippet);
        s.append('\n');
    }

    s.append(this.children[3]); // }
    return s;
};

NODE.Sc = function (x) { // struct constructor fn
    this.children = x;
};
NODE.Sc.prototype.toSnippet = function (ctx) {
    var name = this.children[1];

    var newCtx = ctx.getTypeChild(name.value);
    var typ = ctx.getType(name.value);
    //newCtx.selfType = typ;
    newCtx.returnType = newCtx.getType(TypeKeys.UNIT);

    // generic parameter
    for (var j = 0; j < this.children[2].length; j++) {
        var paramName = this.children[2][j].value;
        var t = new TypeVariable(paramName);
        typ.generics.push(t);
        newCtx.setType(paramName, t);
    }

    if (this.children[3].constructor !== NODE.Tuple && this.children[3].length === 0) {
        var s = new Snippet(ctx.getType(TypeKeys.UNIT));
        s.append('var');
        s.append(' ');
        s.append(name);
        s.append(' = {};');
        //s.append("\n" + name.value + ".type = '" + name + "';");
        return s;
    }

    var x = newvar();
    var inside = new Snippet();

    if (this.children[3].constructor === NODE.Tuple) {
        var types = this.children[3].children;
        for (var j = 0; j < types.length; j++) {
            typ.properties[j] = types[j].toType(newCtx);
            if (j !== 0) {
                inside.append('\n');
            }
            inside.append("this[" + j + "]");
            inside.append(" = " + x + "[" + j + "];");
        }
        /*s.append('var');
        s.append(' ');
        s.append(name);
        s.append(' = Array;');
        s.append("\n" + name.value + ".prototype.type = '" + name + "';");
        //ctx.setIdent(name.value, typ); // expose to outside env as ident
        return s;*/
    } else {
        var keys = [];
        for (var j = 0; j < this.children[3].length; j++) {
            var key = this.children[3][j][0];
            typ.properties[key.value] = this.children[3][j][1].toType(newCtx);
            keys.push(key);
        }

        for (var j = 0; j < keys.length; j++) {
            if (j !== 0) {
                inside.append('\n');
            }
            inside.append('this.');
            inside.append(keys[j]);
            inside.append(" = " + x + "['" + keys[j].value + "'];");
        }
    }

    var s = new Snippet(ctx.getType(TypeKeys.UNIT));
    s.append('function '); // or this.children[0]
    s.append(name);
    s.append("(" + x + ") {");
    s.append('\n');

    if (!inside.isEmpty()) {
        inside.indent();
        s.appendSnippet(inside);
        s.append('\n');
    }

    s.append('}');
    s.append("\n" + name.value + ".prototype.type = '" + name + "';");
    return s;
};

NODE.Enum = function (x) {
    this.children = x;
};
NODE.Enum.prototype.toSnippet = function (ctx) {
    var typ = ctx.getType(this.children[1].value);

    // generic parameter
    var paramNames = this.children[2].map(function(x){return x.value;});
    //for (var j = 0; j < this.children[2].length; j++) {
    //    paramNames.push(this.children[2][j].value);
    //}

    var s = new Snippet(ctx.getType(TypeKeys.UNIT));
    for (var i = 0; i < this.children[4].length; i++) { // structs
        var node = this.children[4][i];
/*
        var newCtx = ctx.newTypeChild(node.children[1].value);
        for (var j = 0; j < typ.generics.length; j++) {
            newCtx.setType(paramNames[j], typ.generics[j]);
        }
        ctx.setType(node.children[1].value, new TypeOperator(node.children[1].value)); // create new type

        // expose enum types (alternatives) to outside env as ident
        var mpgKeys = cloneArray(typ.generics); // mappings
        mpgKeys.push(typ.slot);
        var mpgValues = cloneArray(typ.generics);
        mpgValues.push(ctx.getType(node.children[1].value));

        if (i !== 0) {
            s.append('\n');
        }
        s.appendSnippet(this.children[4][i].toSnippet(ctx));
        ctx.setType(node.children[1].value, typ.getFresh(mpgKeys, mpgValues));
*/

        if (i !== 0) {
            s.append('\n');
        }
        var wrappedType = ctx.getType(node.children[1].value);
        ctx.setType(node.children[1].value, wrappedType.slot); // use slot while evaluating
        s.appendSnippet(this.children[4][i].toSnippet(ctx));
        ctx.setType(node.children[1].value, wrappedType);
    }

    return s;
};

NODE.Attribute = function (x) {
    this.children = x; // #,[,AI,LAI,]
};
NODE.Attribute.prototype.toSnippet = function (ctx) {
    var s = new Snippet(ctx.getType(TypeKeys.UNIT));
    s.append('// ');
    s.append('attribute(s) erased', [this.children[1], this.children[4]]);
    return s;
};

NODE.Trait = function (x) {
    this.children = x; // trait,name,{,ListOfFunctionSignatures,}
};
NODE.Trait.prototype.toSnippet = function (ctx) {
    var s = new Snippet(ctx.getType(TypeKeys.UNIT));
    s.append('var');
    s.append(' ');
    s.append(this.children[1]);
    s.append(' = ');
    s.append(this.children[2]);
    s.append(this.children[4]);
    s.append('; // ');
    s.append(this.children[0]);
    s.append(' erased');
    return s;
};

NODE.Impl = function (x) {
    this.children = x; // impl,P1,for,P1,{,ListOfFunction,}
};
NODE.Impl.prototype.toSnippet = function (ctx) {
    var traitSnippet = this.children[1].toSnippet(ctx); // ignore traitSnippet but confirm existence (type)

    var typeSnippet = this.children[3].toSnippet(ctx);
    var prunedType = prune(typeSnippet.exprType);
    if(prunedType.constructor === TypeOperator && prunedType.instance !== null) {
        //throw new LocatedError("type with generics '" + typeSnippet.toString() + "' cannot implement trait", this.children[4]);
        prunedType = prunedType.instance;
    }

    // change context (now that typeSnippet is evaluated)
    /*ctx = ctx.getTypeChild(typeSnippet.exprType.name);
    if (ctx === null) {
        throw new LocatedError("type '" + typeSnippet.toString() + "' cannot implement trait", this.children[4]);
    }*/
    ctx = new Context(ctx);
    ctx.setIdent('self', prunedType); // introduce self in impl env

    var newCtx;
    var node;
    for (var i = 0; i < this.children[5].length; i++) {
        node = this.children[5][i]; // assert node.constructor === NODE.Fn

        // TODO confirm that fn belongs to trait

        // node is Fn
        newCtx = ctx.newIdentChild(node.children[0][1].value);
        var typ = new TypeOperator('->');
        for (var j = 0; j < node.children[0][2].length; j++) { // generic parameters
            var paramName = node.children[0][2][j].value;
            var t = new TypeVariable(paramName);
            typ.generics.push(t);
            newCtx.setType(paramName, t);
        }
        var argTypes = [];
        for (var j = 0; j < node.children[0][4].length; j++) {
            argTypes.push(node.children[0][4][j][1].toType(newCtx));
        }
        typ.types.push(new TypeOperator('calltuple', argTypes)); // arg
        typ.types.push(node.children[0][6].toType(newCtx)); // return type
        ctx.setIdent(node.children[0][1].value, typ);

        ctx.getIdent('self').properties[node.children[0][1].value] = typ; // TODO pruneToProperty?
    }

    var s = new Snippet(ctx.getType(TypeKeys.UNIT));
    for (var i = 0; i < this.children[5].length; i++) {
        node = this.children[5][i]; // assert node.constructor === NODE.Fn

        if (i !== 0) {
            s.append('\n');
        }
        s.append(typeSnippet.toString()); // toString because otherwise type verbatims will be added in each iteration
        s.append('.prototype.');
        s.append(node.children[0][1]);
        s.append(' = ');
        s.appendSnippet(node.toSnippet(ctx, true)); // isImpl is true
        s.append(';');
    }
    return s;
};

NODE.Mod = function (x) {
    this.children = x; // mod,ident,{,B,}
};
NODE.Mod.prototype.toSnippet = function (ctx) {
    var newCtx = ctx.newModChild(this.children[1].value);
    ctx.setMod(this.children[1].value, ctx.getType(TypeKeys.UNIT));

    var blockSnippet = new NODE.BareBlock(this.children[3]).toSnippet(newCtx);

    // JS return statement which exposes idents outside
    // and thereby creates a namespace
    var envSnippet = new Snippet();
    envSnippet.append('return {');
    envSnippet.append('\n');
    var items = [];
    for (var k in newCtx.modChildrenEnv) {
        items.push(k);
    }
    for (var k in newCtx.typeChildrenEnv) {
        items.push(k);
    }
    for (var k in newCtx.identChildrenEnv) {
        items.push(k);
    }
    var inside = new Snippet();
    for (var i = 0; i < items.length; i++) {
        if (i !== 0) {
            inside.append(',\n');
        }
        inside.append(items[i] + ': ' + items[i]);
    }
    if (!inside.isEmpty()) {
        inside.indent();
        envSnippet.appendSnippet(inside);
        envSnippet.append('\n');
    }
    envSnippet.append('};');

    var s = new Snippet(ctx.getType(TypeKeys.UNIT));
    s.append('var', this.children[0]);
    s.append(' ');
    s.append(this.children[1]);
    s.append(' = ');
    s.append('(function(){', this.children[2]);
    s.append('\n');
    if (!blockSnippet.isEmpty()) {
        blockSnippet.indent();
        s.appendSnippet(blockSnippet);
        s.append('\n');
    }
    envSnippet.indent();
    s.appendSnippet(envSnippet);
    s.append('\n');
    s.append('})();', this.children[4]);
    return s;
};

NODE.Block = function (items) {
    this.items = items || [];
};
NODE.Block.prototype.unshift = function(x) {
    this.items.unshift(x);
};
NODE.Block.prototype.toSnippet = function (ctx) { // exprType property of returned snippet may be null when return is present within
    var node, isLast, result = new Snippet(ctx.getType(TypeKeys.UNIT));

    var newCtx; // for child contexts

    // first process use nodes and remove them
    while (this.items.length > 0 && this.items[0].constructor === NODE.Use) { // assume Use nodes are only at the very top
        node = this.items.shift();
        result.appendSnippet(node.toSnippet(ctx));
        result.append('\n');
    }
    if (!result.isEmpty()) {
        result.append('\n');
    }

    // add trait types to env
    for (var i = 0; i < this.items.length; i++) {
        node = this.items[i];
        if (node.constructor !== NODE.Trait) {
            continue;
        }

        // node is Trait
        newCtx = ctx.newTypeChild(node.children[1].value);
        var typ = new TypeOperator(node.children[1].value); // create new type
        ctx.setType(node.children[1].value, typ);
    }

    // add struct types to env
    for (var i = 0; i < this.items.length; i++) {
        node = this.items[i];
        if (node.constructor !== NODE.Sc) {
            continue;
        }

        // node is Sc
        newCtx = ctx.newTypeChild(node.children[1].value);
        var typ = new TypeOperator(node.children[1].value); // create new type
        ctx.setType(node.children[1].value, typ);
    }

    // add enum types to env
    for (var i = 0; i < this.items.length; i++) {
        node = this.items[i];
        if (node.constructor !== NODE.Enum) {
            continue;
        }

        // node is Enum (ctx remains same)
        var typ = new TypeOperator(node.children[1].value); // create new type
        typ.slot = new TypeVariable('E'); // enum slot
        for (var j = 0; j < node.children[2].length; j++) { // generic parameters
            var paramName = node.children[2][j].value;
            var t = new TypeVariable(paramName);
            typ.generics.push(t);
        }
        for (var j = 0; j < node.children[4].length; j++) { // structs
            var altNode = node.children[4][j];
            newCtx = ctx.newTypeChild(altNode.children[1].value);
            for (var k = 0; k < typ.generics.length; k++) {
                newCtx.setType(typ.generics[k].name, typ.generics[k]);
            }
            var t = new TypeOperator(altNode.children[1].value); // create new type

            // expose enum types (alternatives) to outside env
            var mpgKeys = cloneArray(typ.generics); // mappings
            mpgKeys.push(typ.slot);
            var mpgValues = cloneArray(typ.generics);
            mpgValues.push(t);

            ctx.setType(altNode.children[1].value, typ.getFresh(mpgKeys, mpgValues));
        }
        ctx.setType(node.children[1].value, typ);
    }

    // add functions to env
    for (var i = 0; i < this.items.length; i++) {
        node = this.items[i];
        if (node.constructor !== NODE.Fn) {
            continue;
        }

        // node is Fn
        newCtx = ctx.newIdentChild(node.children[0][1].value);
        var typ = new TypeOperator('->');
        for (var j = 0; j < node.children[0][2].length; j++) { // generic parameters
            var paramName = node.children[0][2][j].value;
            var t = new TypeVariable(paramName);
            typ.generics.push(t);
            newCtx.setType(paramName, t);
        }
        var argTypes = [];
        for (var j = 0; j < node.children[0][4].length; j++) {
            argTypes.push(node.children[0][4][j][1].toType(newCtx));
        }
        typ.types.push(new TypeOperator('calltuple', argTypes)); // arg
        typ.types.push(node.children[0][6].toType(newCtx)); // return type
        ctx.setIdent(node.children[0][1].value, typ);
    }

    // for classification of 'which consecutive nodes gets get an extra intermediate newline'
    var lastNodeClass = -1;
    var currentNodeClass;
    function getNodeClass(x) {
        if (x.constructor === NODE.Attribute) return 0;

        var bItems = [NODE.Mod, NODE.Fn, NODE.Sc, NODE.Enum, NODE.Trait, NODE.Impl,
          NODE.If, NODE.Match, NODE.While, NODE.Loop];
        if (bItems.indexOf(x.constructor) !== -1) return 1;

        return 2;
    }

    // process block
    for (var i = 0; i < this.items.length; i++) {
        node = this.items[i];
        isLast = (i === this.items.length - 1);

        // add extra newline between consecutive functions etc
        // the rules below (if conditions) are generated from truth table
        currentNodeClass = getNodeClass(node);
        if (lastNodeClass === 1 || (lastNodeClass === 2 && currentNodeClass !== 2)) {
            result.append('\n');
        }
        lastNodeClass = currentNodeClass;

        var isSemi = (node.constructor === NODE.Verbatim && node.value === ';');
        var s = node.toSnippet(ctx);
        if (result.exprType !== null) {
            result.exprType = s.exprType;
        }

        if (isLast && s.tail !== null) {
            result.tail = s;
        } else {
            var x = s.introduceVariable();
            if (i !== 0 && !s.isEmpty() && !isSemi) {
                result.append('\n');
            }
            if (x !== null) {
                result.append("var " + x + ";\n");
            }
            result.appendSnippet(s);
        }
    }
    return result;
};

NODE.Use = function (x) {
    this.children = x; // use,idents,;
};
NODE.Use.prototype.toSnippet = function (ctx) {

    // load is called multiple times in case of a::b::{c1,c2}
    // returns {isSelective: true|false}
    function load(components, selectiveAlreadyFound) { // argument eg ['a', 'b'] for `use a::b`
        var envNode;
        var srcPath = components.join('/') + ".rs";
        var lastKey = components[components.length - 1];
        if (!selectiveAlreadyFound && FS.exists(srcPath)) {
            importedCtx = applyPropertyChain(ENV, components); // check env if already loaded
            if (importedCtx === null) {
                transpile(srcPath);
                importedCtx = applyPropertyChain(ENV, components);
            }

            ctx.setMod(lastKey, ctx.getType(TypeKeys.UNIT));
            ctx.modChildrenEnv[lastKey] = importedCtx;
            return {isSelective: false};
        }

        if (components.length === 1) {
            throw "file not found '" + srcPath + "'";
        }

        lastKey = components.pop();
        srcPath = components.join('/') + ".rs";
        if (!FS.exists(srcPath)) {
            throw "file not found '" + srcPath + "'";
        }

        importedCtx = applyPropertyChain(ENV, components); // check env if already loaded
        if (importedCtx === null) {
           transpile(srcPath);
           importedCtx = applyPropertyChain(ENV, components);
        }

        if (importedCtx.getIdent(lastKey) !== null) {
            ctx.setIdent(lastKey, importedCtx.getIdent(lastKey));
            if (importedCtx.identChildrenEnv.hasOwnProperty(lastKey)) {
                ctx.identChildrenEnv[lastKey] = importedCtx.identChildrenEnv[lastKey];
            }
        } else if (importedCtx.getType(lastKey) !== null) {
            ctx.setType(lastKey, importedCtx.getType(lastKey));
            if (importedCtx.typeChildrenEnv.hasOwnProperty(lastKey)) {
                ctx.typeChildrenEnv[lastKey] = importedCtx.typeChildrenEnv[lastKey];
            }
        } else if (importedCtx.getMod(lastKey) !== null) {
            ctx.setMod(lastKey, ctx.getType(TypeKeys.UNIT));
            if (importedCtx.modChildrenEnv.hasOwnProperty(lastKey)) {
                ctx.modChildrenEnv[lastKey] = importedCtx.modChildrenEnv[lastKey];
            }
        } else {
            throw "import failed to find " + lastKey + " in '" + srcPath + "'";
        }

        return {isSelective: true};
    }

    var lastItem = this.children[1][this.children[1].length - 1];
    var keys = this.children[1].map(function(x){return x.constructor === NODE.Verbatim ? x.value : x});

    var s = new Snippet(ctx.getType(TypeKeys.UNIT));

    if (keys[keys.length - 1].constructor === Array) {
        var lastKeys = keys.pop().map(function(x){return x.value;});
        var x = newvar();
        s.append('var ');
        s.append(x);
        s.append(' = ');
        s.append('require', this.children[0]);
        s.append('("./');
        for (var i = 0; i < this.children[1].length - 1; i++) { // note `- 1`
            if (i !== 0) s.append('/');
            s.append(this.children[1][i]);
        }
        s.append('")');
        s.append(this.children[2]);
        for (var i = 0; i < lastKeys.length; i++) {
            var useItem = cloneArray(keys);
            useItem.push(lastKeys[i]);
            try {
                load(useItem, true);
            } catch (e) {
                if (e && e.constructor === LocatedError) throw e;
                throw new LocatedError(e, this.children[0]);
            }
            s.append('\nvar ');
            s.append(lastKeys[i]);
            s.append(' = ' + x + '.');
            s.append(lastItem[i]);
            s.append(';');
        }
    } else {
        var loadResult;
        try {
            loadResult = load(keys, false);
        } catch (e) {
            if (e && e.constructor === LocatedError) throw e;
            throw new LocatedError(e, this.children[0]);
        }
        if (loadResult.isSelective) {
            s.append('var ');
            s.append(lastItem.value);
            s.append(' = ');
            s.append('require', this.children[0]);
            s.append('("./');
            for (var i = 0; i < this.children[1].length - 1; i++) { // note `- 1`
                if (i !== 0) s.append('/');
                s.append(this.children[1][i]);
            }
            s.append('")');
            s.append('.');
            s.append(lastItem);
            s.append(this.children[2]);
        } else {
            s.append('var ');
            s.append(lastItem.value);
            s.append(' = ');
            s.append('require', this.children[0]);
            s.append('("./');
            for (var i = 0; i < this.children[1].length; i++) {
                if (i !== 0) s.append('/');
                s.append(this.children[1][i]);
            }
            s.append('")');
            s.append(this.children[2]);
        }
    }

    return s;
};

// Type nodes are abstractions for type annotations
// these nodes implement `toType(ctx)` which returns TypeVariable/TypeOperator
NODE.TypeMissing = function () {
};
NODE.TypeMissing.prototype.toType = function (ctx) {
    return new TypeVariable();
};

NODE.TypeDiverging = function () {
};
NODE.TypeDiverging.prototype.toType = function (ctx) {
    //throw 'diverging type not supported';
    return null;
};

NODE.TypeIdent = function (node, generics) {
    this.node = node;
    this.generics = generics || [];
};
NODE.TypeIdent.prototype.toType = function (ctx) {
    var s = this.node.toSnippet(ctx);
    var typ = s.exprType;

    if (this.generics.length === 0) {
        return typ;
    }

    if (typ.constructor !== TypeOperator) {
        throw "type '" + s.toString() + "' not known";
    }

    if (this.generics.length > typ.generics.length) {
        throw "too many generic parameters for '" + s.toString() + "'";
    }

    // generic type
    var args = [];
    for (var i = 0; i < this.generics.length; i++) {
        args.push(this.generics[i].toType(ctx));
    }

    var mappingKeys = [];
    var mappingValues = [];
    var j = 0;
    for (var i = 0; i < typ.generics.length; i++) {
        if (typ.generics[i].name === null) continue;
        if (j < args.length) {
            mappingKeys.push(typ.generics[i]);
            mappingValues.push(args[j]);
        }
        j++;
    }
    return typ.getFresh(mappingKeys, mappingValues);
}

NODE.TypeTuple = function (args) {
    this.args = args; // list of type
};
NODE.TypeTuple.prototype.toType = function (ctx) {
    var types = [];
    for (var i = 0; i < this.args.length; i++) {
        types.push(this.args[i].toType(ctx));
    }
    return new TypeOperator('tuple', types);
};

NODE.TypeArray = function (node) {
    this.node = node; // element type
};
NODE.TypeArray.prototype.toType = function (ctx) {
    var genericArrayType = new TypeOperator('[]');
    var genericType = new TypeVariable('T');
    genericArrayType.generics.push(genericType);

    return genericArrayType.getFresh([genericType], [this.node.toType(ctx)]);
};

NODE.TypeClosure = function (fnArgs, retType) {
    this.fnArgs = fnArgs; // list of [des, TY], ignore des
    this.retType = retType; // return type
};
NODE.TypeClosure.prototype.toType = function (ctx) {
    var argType = new TypeOperator('calltuple', []);
    for (var i = 0; i < this.fnArgs.length; i++) {
        argType.types.push(this.fnArgs[i][1].toType(ctx));
    }
    var returnType = this.retType.toType(ctx);
    return new TypeOperator('->', [argType, returnType]);
};

// Des nodes implement `destructure(ctx)`, which returns
//   a function which is passed the expression to be matched/destructured (eg, y in `match y { ... }`)
//   and returns [[condition], type, [ktv_3tuple]]
//   the ktv_3tuple is the variable to be introduced, its type and its value to be assigned
//   eg, [['r1 === r2'], [['x', 'int', '1'], ['y', 'int', '2']]] means condition is (r1 === r2) and var x = 1 and var y = 2 will be introduced

NODE.DesIgnore = function (v) {
    this.v = v;
};
NODE.DesIgnore.prototype.toSnippet = function (ctx) {
    throw new LocatedError('destructure node, not a concrete node (use `destructure` instead)', this.v);
};
NODE.DesIgnore.prototype.destructure = function (ctx) {
    return function (x) { return [[], new TypeVariable(), []]; };
};

NODE.DesSingle = function (v, node) {
    this.v = null; // null because there is no DesSingle operator, reqd because of exprToAST
    this.node = node;
};
NODE.DesSingle.prototype.toSnippet = function (ctx) {
    throw 'destructure node, not a concrete node (use `destructure` instead)';
};
NODE.DesSingle.prototype.destructure = function (ctx) {
    var a = this.node.v;

    // enum type destructuring (nullary tuplestruct)
    if (ctx.getType(a.value) !== null) {
        var typ = ctx.getType(a.value).getFresh();
        return function (x) {
            var conds = [];
            if (x !== null) {
                conds.push(x + " === " + a.value); // or (x + ".type === '" + a.value + "'"); ?
            }
            return [conds, typ, []];
        };
    }

    var t = new TypeVariable();
    return function (x) { return [[], t, [[a, t, x]]]; };
};

NODE.DesTuple = function (x) {
    this.children = x;
};
NODE.DesTuple.prototype.toSnippet = function (ctx) {
    throw 'destructure node, not a concrete node (use `destructure` instead)';
};
NODE.DesTuple.prototype.destructure = function (ctx) {
    var b = this.children;

    return function(x) {
        var ktv = [];
        var ts = []; // type variables
        for(var i = 0; i < b.length; i++) {
            ts.push(new TypeVariable());
            if (b[i].constructor === NODE.DesIgnore) continue;

            // b[i] is a desNode
            var v = null;
            if (x !== null) {
                v = x + "[" + i + "]";
            }
            var des = b[i].destructure(ctx)(v);
            try { unify(des[1], ts[i]); }
            catch (e) { throw new LocatedError("Type checking failed: (tuple field # " + i + ") " + e); } // no verbatims available
            ktv = ktv.concat(des[2]); // ignore condition and type for the time being
        }
        return [[], new TypeOperator('tuple', ts), ktv]; // TODO condition is always true?
    };
};

NODE.DesStruct = function (values, name) { // acts as unary operator on values
    this.name = name;
    this.values = values;
};
NODE.DesStruct.prototype.toSnippet = function (ctx) {
    throw 'destructure node, not a concrete node (use `destructure` instead)';
};
NODE.DesStruct.prototype.destructure = function (ctx) {
    var a = this.name.v;
    var b = this.values;
    var typ = this.name.toSnippet(ctx).exprType; //ctx.getType(a.value).getFresh();

    return function(x) {
        var ktv = [];
        for(var i = 0; i < b.length; i++) {
            if (b[i][1].constructor === NODE.DesIgnore) continue;

            // b[i][1] is a desNode
            var v = null;
            if (x !== null) {
                v = x + "['" + b[i][0].value + "']";
            }
            var des = b[i][1].destructure(ctx)(v);
            try { unify(des[1], pruneToProperty(typ).properties[b[i][0].value]); }
            catch (e) { throw new LocatedError("Type checking failed: (struct field) " + e, b[i][0]); }
            ktv = ktv.concat(des[2]); // ignore condition and type for the time being
        }
        var conds = [];
        if (x !== null) {
            conds.push(x + ".type === '" + a.value + "'");
        }
        return [conds, typ, ktv];
    };
};

NODE.DesTupleStruct = function (values, name) { // acts as unary operator on values
    this.name = name;
    this.values = values;
};
NODE.DesTupleStruct.prototype.toSnippet = function (ctx) {
    throw 'destructure node, not a concrete node (use `destructure` instead)';
};
NODE.DesTupleStruct.prototype.destructure = function (ctx) {
    var a = this.name.v;
    var b = this.values;
    var typ = this.name.toSnippet(ctx).exprType; //ctx.getType(a.value).getFresh();

    return function(x) {
        var ktv = [];
        for(var i = 0; i < b.length; i++) {
            if (b[i].constructor === NODE.DesIgnore) continue;

            // b[i] is a desNode
            var v = null;
            if (x !== null) {
                v = x + "[" + i + "]";
            }
            var des = b[i].destructure(ctx)(v);
            try { unify(des[1], pruneToProperty(typ).properties[i]); }
            catch (e) { throw new LocatedError("Type checking failed: (tuple struct field # " + i + ") " + e); } // no verbatims available
            ktv = ktv.concat(des[2]); // ignore condition and type for the time being
        }
        var conds = [];
        if (x !== null) {
            conds.push(x + ".type === '" + a.value + "'");
        }
        return [conds, typ, ktv];
    };
};

// converts "a + b + c * d / e" to AST and returns root node of the transformed tree
function exprToAST(input) {
//log(JSON.stringify(input));

    function isUnaryOp(x) {
        return (x !== null) && (x.constructor === NODE.Operator) && (x.arity === 1);
    }

    function isBinaryOp(x) {
        return (x !== null) && (x.constructor === NODE.Operator) && (x.arity === 2);
    }

    function isIdent(x) {
        return (x !== null) && !isUnaryOp(x) && !isBinaryOp(x);
    }

    var stk = [], opStk = [];
    var next; // next input
    var last = null; // last input
    var top = null; // top of opStk

    var r = false; // reduce flag, {on: implies reduce stk, off: implies push}

    // order of conditions is critical
    while (r || ((next = input.length === 0 ? null : input.shift()) !== null) || (opStk.length > 0)) {

        if (!r) { // next is fetched only when reduce is off; and when r is on, next is definitely operator

            // if (lastWasIdentOrLeftAssocUnary)
            //    nextShouldNotBe {Ident, right assoc unary}
            // else // i.e. last wasn't ident
            //    nextShouldNotBe {$, Binop, left assoc unary}
            if ((isIdent(last) || (isUnaryOp(last) && !last.rightAssoc)) ? (isIdent(next) || (isUnaryOp(next) && next.rightAssoc)) : (next === null || isBinaryOp(next) || (isUnaryOp(next) && !next.rightAssoc))) {
                throw 'invalid expression';
            }

            last = next;

            if (isIdent(next)) {
                while (top !== null && (isUnaryOp(top) && top.rightAssoc)) {
                    opStk.pop(); // assert === top
                    next = new top.opConstructor(top.opVerbatim, next);
                    top = opStk.length === 0 ? null : opStk[opStk.length - 1];
                }
                stk.push(next);
                continue;
            } else if (isUnaryOp(next) && !next.rightAssoc) {
                var a = stk.pop();
                stk.push(new next.opConstructor(next.opVerbatim, a));
                continue;
            }
        }

        // order of conditions is critical
        // left assoc: same or lesser precendence trigger stk reduce
        // right assoc: lesser precedence triggers stk reduce
        if (next === null) {
            r = true;
        } else if (top === null || isUnaryOp(next)/* || top.rightAssoc !== next.rightAssoc*/ || top.prec < next.prec) { // assert unary is rightAssoc
            r = false;
        } else if (top.prec > next.prec || !top.rightAssoc) {
            r = true;
        } else {
            r = false;
        }

        if (r) {
            // reduce is ineffective if top is null
            // top is null and reduce is only possible if next === null (see conditions above)
            if (top !== null) {
                opStk.pop(); // assert === top

                // assert isBinaryOp
                var b = stk.pop();
                var a = stk.pop();
                stk.push(new top.opConstructor(top.opVerbatim, a, b));
                top = opStk.length === 0 ? null : opStk[opStk.length - 1];
            } else {
                // in case of else, last is not set because next is null
                break; // both top and next are null, stop reducing and return the result in stk
            }
        } else {
            opStk.push(next);
            top = next;
        }
    }

    return stk.length === 0 ? null : stk[0];
}
function testExprToAST(s) { // example of s is "a + b + c * d", note the spaces as delimiter
    if (s.length === 0) return null;
    var input = s.split(/\s+/).map(function (x) {
        var node;
        switch (x) {
        case '~':
            node = new NODE.Operator(NODE.UnaryOp, new NODE.Verbatim(x), 1, true);
        break;
        case '+':
        case '-':
        case '*':
        case '/':
            node = new NODE.Operator(NODE.BinaryOp, new NODE.Verbatim(x), 2, 6);
        break;
        case '<':
            node = new NODE.Operator(NODE.BinaryOp, new NODE.Verbatim(x), 2, false, 6);
        break;
        case '&&':
            node = new NODE.Operator(NODE.BinaryOp, new NODE.Verbatim(x), 2, false, 4);
        break;
        case '.':
            node = new NODE.Operator(NODE.BinaryOp, new NODE.Verbatim(x), 2, false, 9);
        break;
        case '=':
            node = new NODE.Operator(NODE.BinaryOp, new NODE.Verbatim(x), 2, true); // right assoc
        break;
        default:
            node = new NODE.Verbatim(x);
        }
        return node;
    });
    var result = exprToAST(input);
    return result.toString();
}

// Snippet is abstraction of transpiled code units
// exprType: associated expression type
// content: string containing the js code
// tail (optional): if the snippet requires an introduced variable (for example if block ending at expression which needs a var in js)
// verbatims: source map for lexed Rust tokens
function Snippet(e, c, v) {
    this.exprType = e || null;
    this.content = c || '';
    this.iv = null; // introduced variable
    this.tail = null; // null or snippet or snippets
    this.verbatims = v || []; // acts as source map (not necessarily sorted according to src or target)
    this.isSorted = false; // verbatims according to increasing value of 'lo'
    this.context = null;
}
Snippet.prototype.introduceVariable = function () { // returns this.iv for later use in invoker code
    this.iv = (this.tail === null) ? null : newvar();
    return this.iv;
};
Snippet.prototype.toString = function () { // side effect: consumes tail
    if (this.tail !== null) {
        this.consumeTail();
    }
    return this.content;
};
Snippet.prototype.isEmpty = function () { // might be inaccurate, but does NOT consume tail, therefore, safe
    return (this.content.length === 0) && (this.tail === null);
};
Snippet.prototype.f = function (x) {
    if (!this.isSorted) {
        this.verbatims.sort(function(x, y){return x.lo - y.lo;});
        this.isSorted = true;
    }

    var len = this.verbatims.length;
    for (var i = 0; i < len; i++) {
        if (this.verbatims[i].lo <= x && this.verbatims[i].hi > x) return {lo: this.verbatims[i].jsLo, hi: this.verbatims[i].jsHi};
        if (this.verbatims[i].lo > x) return {lo: this.verbatims[i].jsLo, hi: this.verbatims[i].jsLo};
    }
    return len === 0 ? {lo: 0, hi: 0} : {lo: this.verbatims[len - 1].jsHi, hi: this.verbatims[len - 1].jsHi};
};
Snippet.prototype.addNode = function (node, lo, hi) { // node to be mapped
    if (this.verbatims.indexOf(node) !== -1) { // was already in verbatims
        throw 'node was present in snippet verbatims, f(x) maps to two values and is no longer a function';
    }
    if (node.lo === undefined || node.hi === undefined) { // injected code, a fake verbatim
        return;
    }
    node.jsLo = lo;
    node.jsHi = hi;
    this.verbatims.push(node);
};
Snippet.prototype.updateVerbatims = function (i, len) { // insertion at index i of length len
    // ----------------(jsLo--------jsHi)----i----
    // -------i--------(jsLo--------jsHi)--------
    // ----------------(jsLo----i---jsHi)--------
    for (var j = 0; j < this.verbatims.length; j++) {
        if (this.verbatims[j].jsHi <= i) continue;
        if (i <= this.verbatims[j].jsLo) {
            this.verbatims[j].jsLo += len;
            this.verbatims[j].jsHi += len;
            continue;
        }
        this.verbatims[j].jsHi += s.len;
    }
};
Snippet.prototype.append = function (s, nodes) { // mapped verbatim nodes to string or snippet s
    if (arguments.length === 1 && s.constructor === NODE.Verbatim) {
        nodes = [s];
        s = s.value;
    }
    if (typeof s !== 'string') throw 'append on non-string not supported';

    var lo = this.content.length;
    this.content += (typeof s === 'string') ? s : s.content;
    var hi = this.content.length;

    if (typeof s !== 'string') { // its a snippet
        for (var i = 0; i < s.verbatims.length; i++) {
            this.addNode(s.verbatims[i], s.verbatims[i].jsLo + lo, s.verbatims[i].jsHi + lo); 
        }
    }

    if (typeof nodes === 'undefined' || nodes === null) return;
    if (nodes.constructor !== Array) nodes = [nodes];
    for (var i = 0; i < nodes.length; i++) {
        this.addNode(nodes[i], lo, hi);
    }
};
Snippet.prototype.insertAt = function (i, s, nodes) {
    if (arguments.length === 2 && s.constructor === NODE.Verbatim) {
        nodes = [s];
        s = s.value;
    }
    if (typeof s !== 'string') throw 'insertAt on non-string not supported';

    var head = this.content.substring(0, i);
    var tail = this.content.substring(i);
    var lo = head.length;
    var len = (typeof s === 'string') ? s.length : s.content.length;
    var hi = lo + len;
    this.content = head + ((typeof s === 'string') ? s : s.content) + tail;

    this.updateVerbatims(i, len);

    // these needs not be updated, hence below updateVerbatims
    if (typeof s !== 'string') { // its a snippet
        for (var i = 0; i < s.verbatims.length; i++) {
            this.addNode(s.verbatims[i], s.verbatims[i].jsLo + lo, s.verbatims[i].jsHi + lo); // note: this mangles ordering
        }
    }

    if (typeof nodes === 'undefined' || nodes === null) return;
    if (nodes.constructor !== Array) nodes = [nodes];
    for (var i = 0; i < nodes.length; i++) {
        this.addNode(nodes[i], lo, hi);
    }
};
// appendSnippet indents s if s has tail
// this is useful for tail consumption formatting
Snippet.prototype.appendSnippet = function (s) { // side effect: consumes tail of s
    if (s.tail !== null) {
        s.consumeTail();
    }

    var lo = this.content.length;
    this.content += s.content;
    var hi = this.content.length;

    for (var i = 0; i < s.verbatims.length; i++) {
        this.addNode(s.verbatims[i], s.verbatims[i].jsLo + lo, s.verbatims[i].jsHi + lo); 
    }
};
Snippet.prototype.insertSnippetAt = function (i, s) { // side effect: consumes tail of s
    if (s.tail !== null) {
        s.consumeTail();
    }

    var head = this.content.substring(0, i);
    var tail = this.content.substring(i);
    var lo = head.length;
    var len = s.content.length;
    var hi = lo + len;
    this.content = head + s.content + tail;

    this.updateVerbatims(i, len);

    // these needs not be updated, hence below updateVerbatims
    for (var i = 0; i < s.verbatims.length; i++) {
        this.addNode(s.verbatims[i], s.verbatims[i].jsLo + lo, s.verbatims[i].jsHi + lo); // note: this mangles ordering
    }
};
Snippet.prototype.indent = function () { // side effect: consumes tail
    if (this.tail !== null) {
        this.consumeTail();
    }

    //if (this.content.length == 0) return;

    var tab = '    ';

    var j = -1;
    while (j < this.content.length) {
        if (j === -1 || this.content.charCodeAt(j) === 10) { // a newline, "\n", character
            j++;
            this.insertAt(j, tab);
            j += tab.length;
        } else {
            j++;
        }
    }
};
Snippet.prototype.getLastVerbatim = function () {
    return (this.verbatims.length === 0) ? null : this.verbatims[this.verbatims.length - 1];
};
Snippet.prototype.consumeTail = function () { // eat tail using introduced variable `this.iv`
    if (this.tail === null) return;

    if (this.tail.constructor === Snippet) {
        if (this.tail.tail === null) { // => last expr
            var prefix = (this.iv === null) ? 'return ' : (this.iv + " = ");
            this.tail.insertAt(0, prefix);
            this.tail.append(';');
        } else {
            this.tail.iv = this.iv;
        }

        if (this.content.length > 0) {
            this.append('\n');
        }
        this.appendSnippet(this.tail);
    } else { // array of snippet
        for (var i = 0; i < this.tail.length; i++) {
            if (this.content.length > 0) {
                this.append('\n');
            }
            if (this.tail[i].tail === null) {
                // no indent
                this.appendSnippet(this.tail[i]);
            } else {
                this.tail[i].iv = this.iv;
                this.tail[i].indent();
                this.appendSnippet(this.tail[i]);
            }
        }
    }

    this.iv = null;
    this.tail = null;
};