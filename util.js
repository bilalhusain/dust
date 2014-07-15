// browser compatibility
if (typeof String.prototype.endsWith !== 'function') String.prototype.endsWith = function(x) { return this.indexOf(x, this.length - x.length) !== -1; };
if (typeof String.prototype.startsWith !== 'function') String.prototype.startsWith = function(x) { return this.indexOf(x) === 0; };
if (typeof Array.prototype.indexOf !== 'function') Array.prototype.indexOf = function(x) { var index = -1; for (var i = 0; i < this.length; i++) if (this[i] === x) { index = i; break; } return index; };
if (typeof Array.prototype.map !== 'function') Array.prototype.map = function(f) { var result = []; for (var i = 0; i < this.length; i++) result.push(f(this[i])); return result; };
if (typeof console === 'undefined') console = {log: function() {}};

function escapeHtml(s) {
    // TODO 5 types or more accurate form
    s = s.replace(/&/g, '&amp;');
    s = s.replace(/</g, '&lt;');
    s = s.replace(/>/g, '&gt;');
    return s;
}

// for propertyChain = ['a', 'b', 'c']
// returns x['a']['b']['c']
function applyPropertyChain(x, propertyChain) { // returns null if encounters missing property
   var node = x;
   var key;
   for (var i = 0; i < propertyChain.length; i++) {
       key = propertyChain[i];
       if (!node.hasOwnProperty(key)) {
           return null;
       }
       node = node[key];
   }
   return node;
}

// no deep cloning
function cloneAssociativeArray(a) {
    var cloned = {};
    for (var k in a) {
        cloned[k] = a[k];
    }
    return cloned;
}

// no deep cloning
function cloneArray(a) {
    var cloned = [];
    for (var j = 0; j < a.length; j++) {
        cloned.push(a[j]);
    }
    return cloned;
}