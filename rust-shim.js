// workarounds
var Some = function(x) {
    if (x == null) { return '!some'; }
    else { return x; }
};
var None = null;
var fail = function() { terminate('fail!'); };
var assert = function(x) {
    if (x === false) {
        terminate('assertion failure');
    }
};
function new_filemap(src) {
    return {
        src: src,
        start_pos: 0,
        next_line: function() {
            //console.log('dummy filemap.next_line call');
            return null;
        }
    };
}
function str_to_ident(s) {
    return s;
}
function span_to_snippet(sp) {
    return rdr.src.substring(
        byte_offset(rdr, sp.lo),
        byte_offset(rdr, sp.hi));
}
