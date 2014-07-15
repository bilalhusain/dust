var TypeKeys = {
    UNIT: '()',
    BOOL: 'bool',
    CHAR: 'char',
    INT: 'int',
    STR: 'str'
};

var ENV = {}; // container for loaded contexts during tranpilation (populated through `use` statements)

function FileNode(name, isDir, content) {
    this.name = name;
    this.isDir = isDir || false;
    this.content = content || '';
    this.parent = null;
    this.children = {};
}
FileNode.prototype.mkdir = function(path) { // -p
    var names = path.split('/');
    var node = this;
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (name.length === 0) continue;
        if (node.children.hasOwnProperty(name)) {
            if (!node.children[name].isDir) {
                throw name + " exists and is a file";
            }
        } else {
            node.children[name] = new FileNode(name, true);
            node.children[name].parent = node;
        }
        node = node.children[name];
    }
    return node;
};
FileNode.prototype.mkfile = function(path, content) { // overwrite mode for file
    var index = path.lastIndexOf('/');
    var node = this;
    var name = path;
    if (index !== -1) {
        node = this.mkdir(name.substring(0, index));
        name = path.substring(index + 1);
    }
    if (name.length === 0) return node;
    if (node.children.hasOwnProperty(name)) {
        if (node.children[name].isDir) {
            throw name + " exists and is a directory";
        }
    }
    node.children[name] = new FileNode(name, false, content);
    node.children[name].parent = node;
    return node.children[name];
};
FileNode.prototype.exists = function(path) {
    var names = path.split('/');
    var node = this;
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (name.length === 0) continue;
        if (!node.children.hasOwnProperty(name)) {
            return false;
        }
        node = node.children[name];
    }
    return true;
};
FileNode.prototype.getNode = function(path) {
    var names = path.split('/');
    var node = this;
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (name.length === 0) continue;
        if (!node.children.hasOwnProperty(name)) {
            throw name + " does not exist, looking for '" + path + "'";
        }
        node = node.children[name];
    }
    return node;
};
FileNode.prototype.toPath = function() {
    var result = [];
    var node = this;
    while (node.parent !== null) {
        result.unshift(node.name);
        node = node.parent;
    }
    return "/" + result.join('/');
};
FileNode.prototype.tree = function() {
    var result = [];
    for (var k in this.children) {
        result.push(this.children[k].toPath() + (this.children[k].isDir ? '/' : ''));
        if (this.children[k].isDir) {
            result = result.concat(this.children[k].tree());
        }
    }
    return result;
};
var FS = new FileNode('/', true);

// usage: `transpile('/parser/lexer.rs')`
function transpile(path, ctx) {
    //log("transpiling '" + path + "'");
    var fsnode = FS.getNode(path);
    if (!fsnode.name.endsWith('.rs')) {
        throw "file " + path + " is not a '.rs' file";
    }
    var unitname = fsnode.name.substring(0, fsnode.name.length - 3); // filename minus '.rs'

    // parse
    var ast;
    try {
        ast = parse(fsnode.content);
    } catch (e) {
        if (e && e.constructor === LocatedError && e.path === null) {
            e.path = path;
        }
        throw e;
    }

    // ast to target code
    var s;
    ctx = ctx || new Context();
    try {
        s = ast.toSnippet(ctx);
    } catch (e) {
        if (e && e.constructor === LocatedError && e.path === null) {
            e.path = path;
        }
        throw e;
    }

    if (s.exprType !== null) {
        try { unify(ctx.returnType, s.exprType); }
        catch (e) { throw new LocatedError("Type checking failed: (last expression) " + e, null, path); }
    }
    s.consumeTail();

    // add `module.exports` code
    var exportBlock = new Snippet();
    var items = [];
    for (var k in ctx.modChildrenEnv) {
        if (ctx.modChildrenEnv[k].parent === ctx) {
            items.push(k);
        }
    }
    for (var k in ctx.typeChildrenEnv) {
        if (ctx.typeChildrenEnv[k].parent === ctx) {
            items.push(k);
        }
    }
    for (var k in ctx.identChildrenEnv) {
        if (ctx.identChildrenEnv[k].parent === ctx) {
            items.push(k);
        }
    }
    if (items.length > 0) {
        exportBlock.append('\n');
    }
    for (var i = 0; i < items.length; i++) {
        exportBlock.append("\nmodule.exports." + items[i] + " = " + items[i] + ";");
    }
    s.appendSnippet(exportBlock);

    // update compilation env
    var components = fsnode.parent.toPath().split('/');
    var envNode = ENV;
    for (var i = 0; i < components.length; i++) {
        if (components[i].length === 0) continue;
        if (!envNode.hasOwnProperty(components[i])) {
            envNode[components[i]] = {};
        }
        envNode = envNode[components[i]];
    }
    envNode[unitname] = ctx; // TODO remove `use` imports from ctx

    return s;
}

// context contains
// `returnType`: the type or type variable to be unified with any return statement occuring within current node
// `modEnv`: map {modname -> UNIT} in this environment
// `typeEnv`: map {typeKey -> type} in this environment
// `identEnv`: map {identifier -> type or type variable}
// and pointers to parent context and children context of different types
function Context(parentCtx, classification) {
    this.parent = parentCtx || null;
    this.classification = classification || 'mod'; // 'mod' | 'type' | 'ident'

    //this.selfType = null;
    this.returnType = null;

    this.modEnv = {};
    this.typeEnv = {};
    this.identEnv = {};

    this.modChildrenEnv = {};
    this.typeChildrenEnv = {}; // child contexts used for struct decl
    this.identChildrenEnv = {};

    if (typeof parentCtx === 'undefined') {
        this.returnType = new TypeVariable();

        // populate some known type in typeEnv
        for (var k in TypeKeys) {
            this.typeEnv[TypeKeys[k]] = new TypeOperator(TypeKeys[k]);
        }
    }
}
Context.prototype.getMod = function (key) {
    if (this.modEnv.hasOwnProperty(key)) {
        return this.modEnv[key];
    }

    if (this.parent !== null) {
        var value = this.parent.getMod(key);
        if (value === null) return null;

        this.modEnv[key] = value;
        if (this.parent.modChildrenEnv.hasOwnProperty(key)) {
            this.modChildrenEnv[key] = this.parent.modChildrenEnv[key];
        }
        return value;
    }

    return null;
};
Context.prototype.setMod = function (key, value) {
    this.modEnv[key] = value;
};
Context.prototype.getType = function (key) {
    if (this.typeEnv.hasOwnProperty(key)) {
        return this.typeEnv[key];
    }

    if (this.parent !== null) {
        var value = this.parent.getType(key);
        if (value === null) return null;

        this.typeEnv[key] = value;
        if (this.parent.typeChildrenEnv.hasOwnProperty(key)) {
            this.typeChildrenEnv[key] = this.parent.typeChildrenEnv[key];
        }
        return value;
    }

    return null;
};
Context.prototype.setType = function (key, value) {
    this.typeEnv[key] = value;
};
Context.prototype.getIdent = function (key) {
    if (this.identEnv.hasOwnProperty(key)) {
        return this.identEnv[key];
    }

    if (this.parent !== null) {
        var value = this.parent.getIdent(key);
        if (value === null) return null;

        this.identEnv[key] = value;
        if (this.parent.identChildrenEnv.hasOwnProperty(key)) {
            this.identChildrenEnv[key] = this.parent.identChildrenEnv[key] || null;
        }
        return value;
    }

    return null;
};
Context.prototype.setIdent = function (key, value) {
    this.identEnv[key] = value;
};
Context.prototype.getModChild = function (key) {
    return this.modChildrenEnv[key] || null;
};
Context.prototype.newModChild = function (key) {
    var ctx = new Context(this, 'mod');
    this.modChildrenEnv[key] = ctx;
    return ctx;
};
Context.prototype.getTypeChild = function (key) {
    return this.typeChildrenEnv[key] || null;
};
Context.prototype.newTypeChild = function (key) {
    var ctx = new Context(this, 'type');
    this.typeChildrenEnv[key] = ctx;
    return ctx;
};
Context.prototype.getIdentChild = function (key) {
    return this.identChildrenEnv[key] || null;
};
Context.prototype.newIdentChild = function (key) {
    var ctx = new Context(this, 'ident');
    this.identChildrenEnv[key] = ctx;
    return ctx;
};
Context.prototype.toHtmlString = function () {
    var result = "";
    result += "IDENTIFIERS<br />\n";
    for (var k in this.identEnv) {
        result += "'" + k + "' has type " + escapeHtml(typeToString(this.identEnv[k], false)) + "<br />\n";
    }
    result += "<br />\n";
    result += "TYPES<br />\n";
    for (var k in this.typeEnv) {
        if (this.typeEnv[k].name !== k) {
            result += escapeHtml(k + " => ");
        }
        result += escapeHtml(typeToString(this.typeEnv[k], true)) + "<br />\n";
    }
    return result;
};
