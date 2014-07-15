// based on python code by Robert Smallshire

var TYPE_VAR_ID = 0;
var ASSUMED = []; // array elements is [typevariable, propertyname]

function TypeVariable(name) { // TypeVariable has name only when it represents polytype, i.e., name => generic
    this.id = TYPE_VAR_ID++;
    this.name = name || null;
    this.instance = null;
    this.properties = {};
}
TypeVariable.prototype.getFresh = function (mappingKeys, mappingValues) {
    mappingKeys = mappingKeys || [];
    mappingValues = mappingValues || [];

    if (this.name === null) return this;

    // it is generic, substitute
    var index = mappingKeys.indexOf(this);
    if (index !== -1) return mappingValues[index];

    var t = new TypeVariable();
    mappingKeys.push(this);
    mappingValues.push(t);
    return t;
};
TypeVariable.prototype.toHtmlString = function () {
    return escapeHtml(typeToString(this, true));
};

function TypeOperator(name, types) {
    this.name = name;
    this.instance = null; // the polytype it was generated from
    this.generics = []; // generic params or concrete types
    this.types = types || [];
    this.properties = {};
    this.slot = null; // enum
}
TypeOperator.prototype.getFresh = function (mappingKeys, mappingValues) {
    mappingKeys = mappingKeys || [];
    mappingValues = mappingValues || [];

    /*var genericCount = 0;
    for (var i = 0; i < this.generics.length; i++) {
        if (this.generics[i].name !== null) genericCount++;
    }
    if (genericCount === 0 && this.types.length === 0 && this.slot === null) return this;*/
    if (!containsGeneric(this)) return this;

    var result = new TypeOperator(this.name);
    result.instance = this;

    if (this.slot !== null) {
        result.slot = this.slot.getFresh(mappingKeys, mappingValues);
    }

    for (var i = 0; i < this.generics.length; i++) { // may or may not be generics
        result.generics.push(this.generics[i].getFresh(mappingKeys, mappingValues));
    }

    for (var i = 0; i < this.types.length; i++) {
        if (this.types[i] === null) {
            result.types.push(this.types[i]);
            continue;
        }
        result.types.push(this.types[i].getFresh(mappingKeys, mappingValues));
    }

    for (var k in this.properties) {
        result.properties[k] = this.properties[k].getFresh(mappingKeys, mappingValues);
    }

    return result;
};
TypeOperator.prototype.toHtmlString = function () {
    return escapeHtml(typeToString(this, true));
};

function containsGeneric(t, pendingItems, doneItems) {
    pendingItems = pendingItems || [];
    doneItems = doneItems || [];

    if (t === null) { // diverging
        return false;
    }

    if (t.constructor === TypeVariable) {
        if (t.name !== null) return true;
        return false; // don't check variable's properties
    }

    // t is TypeOperator
    if (doneItems.indexOf(t) !== -1) {
        return false; // if its done => no need to search this node for generics
        // note that it does NOT imply that t does NOT contain generic because
        // there might be a cycle linking to a node containing generic, but that
        // node should be in pendingItems; hence returning false here
    }
    if (pendingItems.indexOf(t) !== -1) {
        return false; // cycle encountered but cycles don't help in the search, so ignore and cut short this path (loop)
        //throw 'cyclic dependency found while looking for presence of generic';
    }
    pendingItems.push(t);
    if (t.slot && containsGeneric(t.slot, pendingItems, doneItems)) {
        return true;
    }
    for (var i = 0; i < t.generics.length; i++) {
        if (containsGeneric(t.generics[i], pendingItems, doneItems)) return true;
    }
    for (var i = 0; i < t.types.length; i++) {
        if (containsGeneric(t.types[i], pendingItems, doneItems)) return true;
    }
    for (var k in t.properties) {
        if (containsGeneric(t.properties[k], pendingItems, doneItems)) return true;
    }
    var index = pendingItems.indexOf(t);
    pendingItems.splice(index, 1); // remove item at index
    doneItems.push(t);
    return false;
}

function unify(t1, t2) {
    if (t1 === null || t2 === null) { // diverging type diverges and should NOT be unified
        return;
    }
    if (!t1 || !t2) {
        throw 'type not found';
    }

    var a = prune(t1);
    var b = prune(t2);
    if (a.constructor === TypeVariable) {
        if (a !== b) {
            if (a.name !== null) {
                if (b.constructor === TypeOperator) {
                    throw "can not unify generic with " + b.name;
                } else if (b.name === null) {
                    unify(b, a);
                } else {
                    throw 'can not unify generic';
                }
            }
            if (occursInType(a, b)) throw 'recursive unification';
            a.instance = b;
            for (var k in a.properties) {
                if (b.properties.hasOwnProperty(k)) {
                    unify(a.properties[k], b.properties[k]);
                } else {
                    b.properties[k] = a.properties[k];
                }
            }
        }
    } else if (a.constructor === TypeOperator && b.constructor === TypeVariable) {
        unify(b, a);
    } else if (a.constructor === TypeOperator && b.constructor === TypeOperator) {
        if (a.name !== b.name) {
            throw "type mismatch " + a.name + " vs " + b.name;
        } else if (a.generics.length !== b.generics.length) {
            throw "type mismatch " + a.name + " (generic arity " + a.generics.length + ") vs " + b.name + " (generic arity " + b.generics.length + ")";
        } else if (a.types.length !== b.types.length) {
            throw "type mismatch " + a.name + " (arity " + a.types.length + ") vs " + b.name + " (arity " + b.types.length + ")";
        }
        for (var i = 0; i < a.generics.length; i++) { // TODO generic unification needed?
            unify(a.generics[i], b.generics[i]);
        }
        for (var i = 0; i < a.types.length; i++) {
            unify(a.types[i], b.types[i]);
        }
    } else {
        throw 'not unified';
    }
}

function assumeProperty(t, p) { // type t, property p
    t.properties[p] = new TypeVariable();
    ASSUMED.push([t, p]);
}

function pruneToProperty(t) { // prune + remove enum slot
    if (t.constructor === TypeOperator && t.slot !== null) {
        return t.slot;
    }
    return prune(t);
}

function prune(t) {
    if (t.constructor === TypeVariable && t.instance !== null) {
        t.instance = prune(t.instance);
        return t.instance;
    }
    return t;
}

function occursInType(v, type2) {
    var pruned_type2 = prune(type2);
    if (pruned_type2 === v) { // TODO will this work on copies
        return true;
    } else if (pruned_type2.constructor === TypeOperator) {
        return occursIn(v, pruned_type2.types) || occursIn(v, pruned_type2.generics);
    }
    // TODO check occurences in properties?
    /*for (var k in pruned_type2.properties) {
        if (occursInType(v, pruned_type2.properties[k])) return true;
    }*/
    return false;
}

function occursIn(t, types) {
    for (var i = 0; i < types.length; i++) {
        if (occursInType(t, types[i])) return true;
    }
    return false;
}

function typePropertiesToString(t) {
    if (t === null) { // diverging
        return '';
    }

    var result = [];
    for (var k in t.properties) {
        // verbose should be false for `typeToString` to avoid recursion
        result.push(k + ": " + typeToString(t.properties[k], false));
    }
    return result.length === 0 ? '': (" {" + result.join(';') + "}");
}

function typeToString(t, verbose) {
    verbose = verbose || false;

    if (t === null) { // diverging
        return "!";
    }

    var result;
    if (t.constructor === TypeVariable) {
        if (t.instance !== null) {
            result = "ref " + typeToString(t.instance, verbose);
        } else if (t.name !== null) { // generic
            result = t.name;
        } else {
            result = t.id + '?';
            result += verbose ? typePropertiesToString(t) : '';
        }
    } else if (t.constructor === TypeOperator) {
        result = t.name;
        var genericResult = [];
        for (var i = 0; i < t.generics.length; i++) {
            genericResult.push(t.generics[i].name !== null ? t.generics[i].name : typeToString(t.generics[i], verbose));
        }
        if ((verbose || t.instance !== null) && genericResult.length > 0) {
            result += "<" + genericResult.join(', ') + ">";
        }
        var typesResult = [];
        for (var i = 0; i < t.types.length; i++) {
            typesResult.push(typeToString(t.types[i], verbose));
        }
        if (typesResult.length > 0) {
            result += "[" + typesResult.join(', ') + "]";
        }
        result += verbose ? typePropertiesToString(t) : '';
    } else {
        throw "neither TypeVariable nor TypeOperator " + t.constructor;
    }

    return result;
}