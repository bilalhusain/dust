function escapeCE(s) { // escape for contenteditable
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

// rust syntax highlighter
function rustSH(input, selectionStart, selectionEnd) {

    function span_to_snippet(sp) {
        return rdr.src.substring(byte_offset(rdr, sp.lo), byte_offset(rdr, sp.hi));
    }

    var result = [];
    var rdr = new_low_level_string_reader(null, {src: input, start_pos: 0, next_line: function(){}});
    var last_hi = rdr.last_pos;
    while (rdr.peek_tok.k !== token.EOF.k) {
        string_advance_token(rdr);
        if (rdr.peek_tok.k !== token.EOF.k) {

            // space and comments are skipped by lexer
            if (last_hi < rdr.peek_span.lo) {
                result.push("<span style='color: gray;'>" + escapeCE(span_to_snippet(mk_sp(last_hi, rdr.peek_span.lo))) + "</span>");
            }

            result.push("<span style='color: " + rdr.peek_tok.c + ";'>" + escapeCE(span_to_snippet(rdr.peek_span)) + "</span>");
            last_hi = rdr.peek_span.hi;
        } else {

            // space and comments at the end
            if (last_hi < rdr.last_pos) {
                result.push("<span style='color: gray;'>" + escapeCE(span_to_snippet(mk_sp(last_hi, rdr.last_pos))) + "</span>");
            }
        }
    }
    return result.join('');
}

// js syntax highlighter
function jsSH(input, selectionStart, selectionEnd) {
    selectionStart = selectionStart || 0;
    selectionEnd = selectionEnd || 0;

    if (selectionStart > selectionEnd) { // swap
        var tmp = selectionStart;
        selectionStart = selectionEnd;
        selectionEnd = tmp;
    }

    if (selectionStart === selectionEnd) {
        return "<span>" + escapeCE(input) + "</span>";
    }

    var result = [];
    result.push("<span>" + escapeCE(input.substring(0, selectionStart)) + "</span>");
    result.push("<span style='background-color: yellow;'>" + escapeCE(input.substring(selectionStart, selectionEnd)) + "</span>");
    result.push("<span>" + escapeCE(input.substring(selectionEnd)) + "</span>");
    return result.join('');
}

function Backlit(id, content, sh) {
    this.id = id;
    this.el = document.getElementById(id);
    this.content = content;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.sh = sh; // syntax highlighter function (str -> html)
}

Backlit.prototype.render = function () {
    this.el.innerHTML = this.sh(this.content, this.selectionStart, this.selectionEnd);
};

Backlit.prototype.renderWithSelection = function (a, b) {
    this.selectionStart = a;
    this.selectionEnd = b;
    this.render();
    this.setSelectionRange(this.selectionStart, this.selectionEnd);
};

Backlit.prototype.visit = function (f) { // apply function f to see if visitor should proceed
    var q = [this.el]; // depth first search

    var node;
    while (q.length > 0) {
        node = q.pop();
        if (!f(node)) break;

        if (node.childNodes.length === 0) {
            continue;
        }

        for (var i = node.childNodes.length - 1; i >= 0; i--) {
            q.push(node.childNodes[i]);
        }
    }
};

// - reads latest content
// - updates selectionStart and selectionEnd if selection is within the element
// - normalizes innerHTML
Backlit.prototype.noticeChanges = function () {
    var newContent = ""; // to be computed

    var selection = document.getSelection();

    var anchorNode = selection.anchorNode;
    var anchorOffset = selection.anchorOffset;
    if (anchorNode.nodeType !== document.TEXT_NODE) { // in this case, offset is the child number
        if (anchorNode.childNodes.length > 0) { // it points to <br>
            anchorNode = anchorNode.childNodes[anchorOffset];
            anchorOffset = 0;
        }
    }

    var focusNode = selection.focusNode;
    var focusOffset = selection.focusOffset;
    if (focusNode.nodeType !== document.TEXT_NODE) { // in this case, offset is the child number
        if (focusNode.childNodes.length > 0) { // it points to <br>
            focusNode = focusNode.childNodes[focusOffset];
            focusOffset = 0;
        }
    }

    var selectionStart = 0; // not that in this case `selectionStart > selectionEnd` is possible
    var selectionEnd = 0;

    var anchorFound = false;
    var focusFound = false;

    var lastVisited = null;
    this.visit(function(curr){
        if (curr.nodeType === document.TEXT_NODE) {
            if (!anchorFound) {
                if (curr === anchorNode) {
                    anchorFound = true;
                    selectionStart += anchorOffset;
                } else {
                    selectionStart += curr.textContent.length;
                }
            }
            if (!focusFound) {
                if (curr === focusNode) {
                    focusFound = true;
                    selectionEnd += focusOffset;
                } else {
                    selectionEnd += curr.textContent.length;
                }
            }
            newContent += curr.textContent;
        } else if (curr.nodeName === 'BR') {
            if (!anchorFound) {
                if (curr === anchorNode) {
                    anchorFound = true;
                    selectionStart += anchorOffset;
                } else {
                    selectionStart += 1;
                }
            }
            if (!focusFound) {
                if (curr === focusNode) {
                    focusFound = true;
                    selectionEnd += focusOffset;
                } else {
                    selectionEnd += 1;
                }
            }
            newContent += "\n";
        } else { // intermediate node; do not add to selection or content
            if (!anchorFound) {
                if (curr === anchorNode) {
                    anchorFound = true;
                    selectionStart += anchorOffset;
                }
            }
            if (!focusFound) {
                if (curr === focusNode) {
                    focusFound = true;
                    selectionEnd += focusOffset;
                }
            }
            if (lastVisited !== null && lastVisited.nodeName !== 'BR' && curr.nodeName === 'DIV') {
                if (!anchorFound) selectionStart += 1;
                if (!focusFound) selectionEnd += 1;
                newContent += "\n";
            }
        }
        lastVisited = curr;
        return true;
    });

    if (anchorNode === undefined) { // TODO points to end of a childnode, assume lastVisited for the time being
        anchorFound = true;
        anchorNode = lastVisited;
    }

    if (focusNode === undefined) { // TODO points to end of a childnode, assume lastVisited for the time being
        focusFound = true;
        focusNode = lastVisited;
    }

    if (!anchorFound || !focusFound) { // selection was outside el
        return;
    }

    // update selection range
    this.selectionStart = selectionStart;
    this.selectionEnd = selectionEnd;

    if (newContent === this.content) {
        return;
    }

    // some change has happened, update content
    this.content = newContent;
    this.render();
    this.setSelectionRange(this.selectionStart, this.selectionEnd);
};

// restores caret
Backlit.prototype.setSelectionRange = function (selectionStart, selectionEnd) {
    var selectionStartCounter = 0; // will count up to selectionStart (lesser)
    var selectionEndCounter = 0;

    var newAnchorNode = null;
    var newAnchorOffset = 0;
    var newFocusNode = null;
    var newFocusOffset = 0;

    this.visit(function(curr){
        if (curr.nodeType === document.TEXT_NODE) {
            if (newAnchorNode === null) {
                if (selectionStartCounter + curr.textContent.length >= selectionStart) {
                    newAnchorNode = curr;
                    newAnchorOffset = selectionStart - selectionStartCounter;
                } else {
                    selectionStartCounter += curr.textContent.length;
                }
            }
            if (newFocusNode === null) {
                if (selectionEndCounter + curr.textContent.length >= selectionEnd) {
                    newFocusNode = curr;
                    newFocusOffset = selectionEnd - selectionEndCounter;
                } else {
                    selectionEndCounter += curr.textContent.length;
                }
            }
        } else if (curr.nodeName === 'BR') {
            if (newAnchorNode === null) {
                if (selectionStartCounter + 1 > selectionStart) { // only less than here
                    newAnchorNode = curr.parentNode;
                    for (var i = 0; i < newAnchorNode.childNodes.length; i++) {
                        if (newAnchorNode.childNodes[i] === curr) {
                            newAnchorOffset = i;
                            break;
                        }
                    }
                } else {
                    selectionStartCounter += 1;
                }
            }
            if (newFocusNode === null) {
                if (selectionEndCounter + 1 > selectionEnd) { // only less than here
                    newFocusNode = curr.parentNode;
                    for (var i = 0; i < newFocusNode.childNodes.length; i++) {
                        if (newFocusNode.childNodes[i] === curr) {
                            newFocusOffset = i;
                            break;
                        }
                    }
                } else {
                    selectionEndCounter += 1;
                }
            }
        } else { // ignore
        }
        return true;
    });

    if (newAnchorNode === null) throw 'new selection anchor node not found in backlit';
    if (newFocusNode === null) throw 'new selection focus node not found in backlit';

    // update selection
    this.selectionStart = selectionStart;
    this.selectionEnd = selectionEnd;

    // everything sane
    var selection = document.getSelection();
    var range = document.createRange();
    range.setStart(newAnchorNode, newAnchorOffset);
    range.setEnd(newFocusNode, newFocusOffset);
    selection.removeAllRanges();
    selection.addRange(range);
};