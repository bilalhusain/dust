// basic lexer (forget about unicode, macro and complexities)
// from lexer.rs

/*function new_string_reader(span_diagnostic, filemap) {
    var r = new_low_level_string_reader(span_diagnostic, filemap);
    string_advance_token(r);
    return r;
}*/

function new_low_level_string_reader(span_diagnostic, filemap) {
    var initial_char = '\n';
    var r = {
        span_diagnostic: span_diagnostic,
        src: filemap.src,
        pos: filemap.start_pos,
        last_pos: filemap.start_pos,
        col: 0,
        curr: initial_char,
        filemap: filemap,
        peek_tok: {},
        peek_span: null,
        fatal: function(m) {
            terminate(m);
        },
        next_token: function() {
            alert('next_token not implemented');
        }
    };
    /*r['next_token'] = function() {
            var ret_val = { tok: ?, sp: ? }; // TODO why replacement with _ // ref self/parent?
            string_advance_token(?);
            return ret_val;
    };*/
    bump(r);
    return r;
}

function mk_sp(lo, hi) {
    return {lo: lo, hi: hi};
}

function fatal_span(rdr, from_pos, to_pos, m) {
    rdr.peek_span = mk_sp(from_pos, to_pos);
    rdr.fatal(m);
}

function fatal_span_char(rdr, from_pos, to_pos, m, c) {
    m += ': ' + c; // TODO
    fatal_span(rdr, from_pos, to_pos, m);
}

function fatal_span_verbose(rdr, from_pos, to_pos, m) {
    m += ': ' + rdr.src.substring(
                  byte_offset(rdr, from_pos),
                  byte_offset(rdr, to_pos));
    fatal_span(rdr, from_pos, to_pos, m);
}

function string_advance_token(r) {
    var comment = consume_whitespace_and_comments(r);
    if (comment === Some(comment)) {
        r.peek_span = comment.sp;
        r.peek_tok = comment.tok;
    } else if (comment === None) {
        if (is_eof(r)) {
            r.peek_tok = token.EOF;
        } else {
            var start_bytepos = r.last_pos;
            r.peek_tok = next_token_inner(r);
            r.peek_span = mk_sp(start_bytepos, r.last_pos);
        }
    }
}

function byte_offset(rdr, pos) {
    return pos - rdr.filemap.start_pos;
}

function with_str_from(rdr, start, f) {
    return with_str_from_to(rdr, start, rdr.last_pos, f);
}

function with_str_from_to(rdr, start, end, f) {
    return f(rdr.src.substring(
            byte_offset(rdr, start),
            byte_offset(rdr, end)));
}

function bump(rdr) {
    rdr.last_pos = rdr.pos;
    var current_byte_offset = byte_offset(rdr, rdr.pos);
    if (current_byte_offset < (rdr.src).length) {
        assert(rdr.curr != -1);
        var last_char = rdr.curr;
        var next = {ch: rdr.src.charAt(current_byte_offset), next: current_byte_offset + 1};
        var byte_offset_diff = next.next - current_byte_offset;
        rdr.pos = rdr.pos + byte_offset_diff;
        rdr.curr = next.ch;
        rdr.col = rdr.col + 1;
        if (last_char == '\n') {
            rdr.filemap.next_line(rdr.last_pos);
            rdr.col = 0;
        }

        if (byte_offset_diff > 1) {
            rdr.fatal("multibyte char not supported"); // TODO no support for multibyte char
        }
    } else {
        rdr.curr = -1;
    }
}

function is_eof(rdr) {
    return rdr.curr == -1;
}

function nextch(rdr) {
    var offset = byte_offset(rdr, rdr.pos);
    if (offset < (rdr.src).length) {
        return rdr.src.charAt(offset);
    } else {
        return -1;
    }
}

function hex_digit_val(c) {
    if (in_range(c, '0', '9')) { return c.charCodeAt(0) - '0'.charCodeAt(0); }
    if (in_range(c, 'a', 'f')) { return c.charCodeAt(0) - 'a'.charCodeAt(0) + 10; }
    if (in_range(c, 'A', 'F')) { return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10; }
    fail();
}

function is_whitespace(c) {
    return c == ' ' || c == '\t' || c == '\r' || c == '\n';
}

function in_range(c, lo, hi) {
    return lo.charCodeAt(0) <= c.charCodeAt(0) && c.charCodeAt(0) <= hi.charCodeAt(0);
}

function is_dec_digit(c) { return in_range(c, '0', '9'); }

function is_hex_digit(c) {
    return in_range(c, '0', '9') || in_range(c, 'a', 'f') ||
            in_range(c, 'A', 'F');
}

function consume_whitespace_and_comments(rdr) {
    while (is_whitespace(rdr.curr)) { bump(rdr); }
    return consume_any_line_comment(rdr);
}

function is_line_non_doc_comment(s) {
    return s.startsWith("////");
}

function consume_any_line_comment(rdr) {
    if (rdr.curr == '/') {
        var _c = nextch(rdr);
        if (_c == '/') {
            bump(rdr);
            bump(rdr);
            if (rdr.curr == '/' || rdr.curr == '!') {
                var start_bpos = rdr.pos - 3;
                while (rdr.curr != '\n' && !is_eof(rdr)) {
                    bump(rdr);
                }
                var ret = with_str_from(rdr, start_bpos, function(str) {
                    if (!is_line_non_doc_comment(str)) {
                        return {
                            tok: token.DOC_COMMENT(str_to_ident(str)),
                            sp: mk_sp(start_bpos, rdr.pos)
                        };
                    } else {
                        return None;
                    }
                });

                if (ret == Some(ret)) {
                    return ret;
                }
            } else {
                while (rdr.curr != '\n' && !is_eof(rdr)) { bump(rdr); }
            }
            return consume_whitespace_and_comments(rdr);
        } else if (_c == '*') { bump(rdr); bump(rdr); return consume_block_comment(rdr); }
        else {}
    } else if (rdr.curr == '#') {
        if (nextch(rdr) == '!') {
            rdr.fatal("shebang not supported"); // TODO
            /*let cmap = @CodeMap::new();
            (*cmap).files.push(rdr.filemap);
            let loc = cmap.lookup_char_pos_adj(rdr.last_pos);
            if loc.line == 1u && loc.col == CharPos(0u) {
                while rdr.curr != '\n' && !is_eof(rdr) { bump(rdr); }
                return consume_whitespace_and_comments(rdr);
            }*/
        }
    }
    return None;
}

function is_block_non_doc_comment(s) {
    return s.startsWith("/***");
}

function consume_block_comment(rdr) {
    var is_doc_comment = (rdr.curr == '*' || rdr.curr == '!');
    var start_bpos = rdr.pos - (is_doc_comment ? 3 : 2);

    var level = 1;
    while (level > 0) {
        if (is_eof(rdr)) {
            var msg = is_doc_comment ? "unterminated block doc-comment" : "unterminated block comment";
            fatal_span(rdr, start_bpos, rdr.last_pos, msg);
        } else if (rdr.curr == '/' && nextch(rdr) == '*') {
            level += 1;
            bump(rdr);
            bump(rdr);
        } else if (rdr.curr == '*' && nextch(rdr) == '/') {
            level -= 1;
            bump(rdr);
            bump(rdr);
        } else {
            bump(rdr);
        }
    }

    var res;
    if (is_doc_comment) {
        res = with_str_from(rdr, start_bpos, function(str) {
            if (!is_block_non_doc_comment(str)) {
                return {
                    tok: token.DOC_COMMENT(str_to_ident(str)),
                    sp: mk_sp(start_bpos, rdr.pos)
                }
            } else {
                return None;
            }
        })
    } else {
        res = None;
    };

    if (res == Some(res)) { return res; } else { return consume_whitespace_and_comments(rdr); }
}

function scan_exponent(rdr, start_bpos) {
    var c = rdr.curr;
    var rslt = "";
    if (c == 'e' || c == 'E') {
        rslt += c;
        bump(rdr);
        c = rdr.curr;
        if (c == '-' || c == '+') {
            rslt += c;
            bump(rdr);
        }
        var exponent = scan_digits(rdr, 10);
        if (exponent.length > 0) {
            return rslt + exponent;
        } else {
            fatal_span(rdr, start_bpos, rdr.last_pos,
                       "scan_exponent: bad fp literal");
        }
    } else { return None; }
}

function scan_digits(rdr, radix) {
    var rslt = "";
    while (true) {
        var c = rdr.curr;
        if (c == '_') { bump(rdr); continue; }
        var _c = parseInt(c, radix);
        if (c != -1 && !isNaN(_c)) { // TODO added fix to avoid infinite loop when input is 4.`EOF`
            rslt += c;
            bump(rdr);
        } else {
            return rslt;
        }
    };
}

function scan_number(c, rdr) {
    var num_str;
    var base = 10;
    var n = nextch(rdr);
    var start_bpos = rdr.last_pos;
    if (c == '0' && n == 'x') {
        bump(rdr);
        bump(rdr);
        base = 16;
    } else if (c == '0' && n == 'o') {
        bump(rdr);
        bump(rdr);
        base = 8;
    } else if (c == '0' && n == 'b') {
        bump(rdr);
        bump(rdr);
        base = 2;
    }
    num_str = scan_digits(rdr, base);
    c = rdr.curr;
    nextch(rdr);
    if (c == 'u' || c == 'i') {
        var signed = (c == 'i');
        var tp = signed ? 'ty_i' : 'ty_u';
        bump(rdr);
        c = rdr.curr;
        if (c == '8') {
            bump(rdr);
            tp = signed ? 'ty_i8' : 'ty_u8';
        }
        n = nextch(rdr);
        if (c == '1' && n == '6') {
            bump(rdr);
            bump(rdr);
            tp = signed ? 'ty_i16' : 'ty_u16';
        } else if (c == '3' && n == '2') {
            bump(rdr);
            bump(rdr);
            tp = signed ? 'ty_i32' : 'ty_u32';
        } else if (c == '6' && n == '4') {
            bump(rdr);
            bump(rdr);
            tp = signed ? 'ty_i64' : 'ty_u64';
        }
        if (num_str.length == 0) {
            fatal_span(rdr, start_bpos, rdr.last_pos,
                       "no valid digits found for number");
        }
        var parsed = parseInt(num_str, base);
        if (isNaN(parsed)) { // TODO better parsing
            fatal_span(rdr, start_bpos, rdr.last_pos,
                               "int literal is too large")
        };

        if (tp.startsWith('ty_i')) {
            return token.LIT_INT(parsed, tp);
        } else {
            return token.LIT_UINT(parsed, tp)
        }
    }
    var is_float = false;
    if (rdr.curr == '.' && !(ident_start(nextch(rdr)) || nextch(rdr) == '.')) {
        is_float = true;
        bump(rdr);
        var dec_part = scan_digits(rdr, 10);
        num_str += '.';
        num_str += dec_part;
    }
    if (is_float) {
        if (base == 16) fatal_span(rdr, start_bpos, rdr.last_pos,
                            "hexadecimal float literal is not supported")
        else if (base == 8) fatal_span(rdr, start_bpos, rdr.last_pos,
                           "octal float literal is not supported")
        else if (base == 2)  fatal_span(rdr, start_bpos, rdr.last_pos,
                           "binary float literal is not supported")
        else {}
    }
    var _c = scan_exponent(rdr, start_bpos);
    if (_c == Some(_c)) {
        is_float = true;
        num_str += _c;
    }

    if (rdr.curr == 'f') {
        bump(rdr);
        c = rdr.curr;
        n = nextch(rdr);
        if (c == '3' && n == '2') {
            bump(rdr);
            bump(rdr);
            return token.LIT_FLOAT(str_to_ident(num_str),
                                 'ty_f32');
        } else if (c == '6' && n == '4') {
            bump(rdr);
            bump(rdr);
            return token.LIT_FLOAT(str_to_ident(num_str),
                                 'ty_f64');
        } else {
            fatal_span(rdr, start_bpos, rdr.last_pos, "expected `f32` or `f64` suffix");
        }
    }
    if (is_float) {
        return token.LIT_FLOAT_UNSUFFIXED(str_to_ident(num_str));
    } else {
        if (num_str.length == 0) {
            fatal_span(rdr, start_bpos, rdr.last_pos,
                       "no valid digits found for number");
        }
        var parsed = parseInt(num_str, base);
        if(isNaN(parsed)) {
            fatal_span(rdr, start_bpos, rdr.last_pos,
                               "int literal is too large")
        };

        //console.log("lexing " + num_str + " as an unsuffixed integer literal");
        return token.LIT_INT_UNSUFFIXED(parsed);
    }
}

function scan_numeric_escape(rdr, n_hex_digits) {
    var accum_int = 0;
    var i = n_hex_digits;
    var start_bpos = rdr.last_pos;
    while (i != 0) {
        var n = rdr.curr;
        if (!is_hex_digit(n)) {
            fatal_span_char(rdr, rdr.last_pos, rdr.pos,
                            "illegal character in numeric character escape",
                            n);
        }
        bump(rdr);
        accum_int *= 16;
        accum_int += hex_digit_val(n);
        i -= 1;
    }
    return String.fromCharCode(accum_int);
    // TODO better check for illegal numeric character escape
    //match char::from_u32(accum_int as u32) {
    //    Some(x) => x,
    //    None => fatal_span(rdr, start_bpos, rdr.last_pos,
    //                       ~"illegal numeric character escape")
    //}
}

function ident_start(c) {
    return (c >= 'a' && c <= 'z')
        || (c >= 'A' && c <= 'Z')
        || c == '_';
}

function ident_continue(c) {
    return (c >= 'a' && c <= 'z')
        || (c >= 'A' && c <= 'Z')
        || (c >= '0' && c <= '9')
        || c == '_';
}

function next_token_inner(rdr) {
    var c = rdr.curr;
    if (ident_start(c) && nextch(rdr) != '"' && nextch(rdr) != '#') {
        var start = rdr.last_pos;
        while (ident_continue(rdr.curr)) {
            bump(rdr);
        }

        return with_str_from(rdr, start, function(str) {
            if (str == "_") {
                return token.UNDERSCORE;
            } else {
                var is_mod_name = (rdr.curr == ':' && nextch(rdr) == ':');
                return token.IDENT(str_to_ident(str), is_mod_name);
            }
        });
    }
    if (is_dec_digit(c)) {
        return scan_number(c, rdr);
    }
    function binop(rdr, op) {
        bump(rdr);
        if (rdr.curr == '=') {
            bump(rdr);
            return token.BINOPEQ(op);
        } else { return token.BINOP(op); }
    }
    if (c == ';') { bump(rdr); return token.SEMI; }
    else if (c == ',') { bump(rdr); return token.COMMA; }
    else if (c == '.') {
          bump(rdr);
          if (rdr.curr == '.') {
              bump(rdr);
              if (rdr.curr == '.') {
                  bump(rdr);
                  return token.DOTDOTDOT;
              } else {
                  return token.DOTDOT;
              }
          } else {
              return token.DOT;
          }
    }
    else if (c =='(') { bump(rdr); return token.LPAREN; }
    else if (c == ')') { bump(rdr); return token.RPAREN; }
    else if (c == '{') { bump(rdr); return token.LBRACE; }
    else if (c == '}') { bump(rdr); return token.RBRACE; }
    else if (c == '[') { bump(rdr); return token.LBRACKET; }
    else if (c == ']') { bump(rdr); return token.RBRACKET; }
    else if (c == '@') { bump(rdr); return token.AT; }
    else if (c == '#') { bump(rdr); return token.POUND; }
    else if (c == '~') { bump(rdr); return token.TILDE; }
    else if (c == ':') {
        bump(rdr);
        if (rdr.curr == ':') {
            bump(rdr);
            return token.MOD_SEP;
        } else { return token.COLON; }
    }

    else if (c == '$') { bump(rdr); return token.DOLLAR; }

    else if (c == '=') {
        bump(rdr);
        if (rdr.curr == '=') {
            bump(rdr);
            return token.EQEQ;
        } else if (rdr.curr == '>') {
            bump(rdr);
            return token.FAT_ARROW;
        } else {
            return token.EQ;
        }
    }
    else if (c == '!') {
        bump(rdr);
        if (rdr.curr == '=') {
            bump(rdr);
            return token.NE;
        } else { return token.NOT; }
    }
    else if (c == '<') {
        bump(rdr);
        var _c1 = rdr.curr;
        if (_c1 == '=') { bump(rdr); return token.LE; }
        else if (_c1 == '<') { return binop(rdr, token.SHL); }
        else if (_c1 == '-') {
            bump(rdr);
            var _c2 = rdr.curr;
            if (_c2 == '>') { bump(rdr); return token.DARROW; }
            else { return token.LARROW; }
        }
        else { return token.LT; }
    }
    else if (c == '>') {
        bump(rdr);
        var _c3 = rdr.curr;
        if (_c3 == '=') { bump(rdr); return token.GE; }
        else if (_c3 == '>') { return binop(rdr, token.SHR); }
        else { return token.GT; }
    }
    else if (c == '\'') {
        bump(rdr);
        var start = rdr.last_pos;
        var c2 = rdr.curr;
        bump(rdr);

        if (ident_start(c2) && rdr.curr != '\'') {
            while (ident_continue(rdr.curr)) {
                bump(rdr);
            }
            return with_str_from(rdr, start, function(lifetime_name) {
                var ident = str_to_ident(lifetime_name);
                var tok = token.IDENT(ident, false);

                /*if (token.is_any_keyword(tok)
                    && !token.is_keyword(token.keywords.Static, tok)
                    && !token.is_keyword(token.keywords.Self, tok)) {
                    fatal_span(rdr, start, rdr.last_pos,
                        "invalid lifetime name");
                }*/// changed in commit 5731ca3078318a66a13208133d8839a9f9f92629

                if (token.is_keyword(token.keywords.Self, tok)) {
                    fatal_span(rdr, start, rdr.last_pos,
                        "invalid lifetime name: 'self is no longer a special lifetime");
                } else if (token.is_any_keyword(tok)
                    && !token.is_keyword(token.keywords.Static, tok)) {
                    fatal_span(rdr, start, rdr.last_pos,
                        "invalid lifetime name");
                } else {
                    return token.LIFETIME(ident);
                }
            })
        }

        if (c2 == '\\') {
                var escaped = rdr.curr;
                var escaped_pos = rdr.last_pos;
                bump(rdr);
                if (escaped == 'n') { c2 = '\n'; }
                else if (escaped == 'r') { c2 = '\r'; }
                else if (escaped == 't') { c2 = '\t'; }
                else if (escaped == '\\') { c2 = '\\'; }
                else if (escaped == '\'') { c2 = '\''; }
                else if (escaped == '"') { c2 = '"'; }
                else if (escaped == '0') { c2 = '\x00'; }
                else if (escaped == 'x') { c2 = scan_numeric_escape(rdr, 2); }
                else if (escaped == 'u') { c2 = scan_numeric_escape(rdr, 4); }
                else if (escaped == 'U') { c2 = scan_numeric_escape(rdr, 8); }
                else {
                        fatal_span_char(rdr, escaped_pos, rdr.last_pos,
                                        "unknown character escape", escaped);
                }
        } else if (c2 == '\t' || c2 == '\n' || c2 == '\r' || c2 == '\'') {
                fatal_span_char(rdr, start, rdr.last_pos,
                                "character constant must be escaped", c2);
        } else {
        }
        if (rdr.curr != '\'') {
            fatal_span_verbose(rdr,
                               start - 1,
                               rdr.last_pos,
                               "unterminated character constant");
        }
        bump(rdr);
        return token.LIT_CHAR(c2.charCodeAt(0));
    }
    else if (c == '"') {
        var accum_str = "";
        var start_bpos = rdr.last_pos;
        bump(rdr);
        while (rdr.curr != '"') {
            if (is_eof(rdr)) {
                fatal_span(rdr, start_bpos, rdr.last_pos,
                           "unterminated double quote string");
            }

            var ch = rdr.curr;
            bump(rdr);
            if (ch == '\\') {
                var escaped = rdr.curr;
                var escaped_pos = rdr.last_pos;
                bump(rdr);
                if (escaped == 'n') { accum_str += '\n'; }
                else if (escaped == 'r') { accum_str += '\r'; }
                else if (escaped == 't') { accum_str += '\t'; }
                else if (escaped == '\\') { accum_str += '\\'; }
                else if (escaped == '\'') { accum_str += '\''; }
                else if (escaped == '"') { accum_str += '"'; }
                else if (escaped == '\n') { consume_whitespace(rdr); }
                else if (escaped == '0') { accum_str += '\x00'; }
                else if (escaped == 'x') {
                    accum_str += scan_numeric_escape(rdr, 2);
                }
                else if (escaped == 'u') {
                    accum_str += scan_numeric_escape(rdr, 4);
                }
                else if (escaped == 'U') {
                    accum_str += scan_numeric_escape(rdr, 8);
                }
                else {
                    fatal_span_char(rdr, escaped_pos, rdr.last_pos,
                                    "unknown string escape", escaped);
                }
            }
            else {
                accum_str += ch;
            }
        }
        bump(rdr);
        return token.LIT_STR(str_to_ident(accum_str));
    }
    else if (c == 'r') {
        var start_bpos = rdr.last_pos;
        bump(rdr);
        var hash_count = 0;
        while (rdr.curr == '#') {
            bump(rdr);
            hash_count += 1;
        }
        if (rdr.curr != '"') {
            fatal_span_char(rdr, start_bpos, rdr.last_pos,
                            "only `#` is allowed in raw string delimitation; found illegal character",
                            rdr.curr);
        }
        bump(rdr);
        var content_start_bpos = rdr.last_pos;
        var content_end_bpos;
        outer: while (true) {
            if (is_eof(rdr)) {
                fatal_span(rdr, start_bpos, rdr.last_pos,
                           "unterminated raw string");
            }
            if (rdr.curr == '"') {
                content_end_bpos = rdr.last_pos;
                for (var _x1 = 0; _x1 < hash_count; _x1++) {
                    bump(rdr);
                    if (rdr.curr != '#') {
                        continue outer;
                    }
                }
                break;
            }
            bump(rdr);
        }
        bump(rdr);
        var str_content = with_str_from_to(rdr,
                                           content_start_bpos,
                                           content_end_bpos,
                                           str_to_ident);
        return token.LIT_STR_RAW(str_content, hash_count);
    }
    else if (c == '-') {
        if (nextch(rdr) == '>') {
            bump(rdr);
            bump(rdr);
            return token.RARROW;
        } else { return binop(rdr, token.MINUS); }
    }
    else if (c == '&') {
        if (nextch(rdr) == '&') {
            bump(rdr);
            bump(rdr);
            return token.ANDAND;
        } else { return binop(rdr, token.AND); }
    }
    else if (c == '|') {
        if (nextch(rdr) == '|') {
            bump(rdr);
            bump(rdr);
            return token.OROR;
        } else { return binop(rdr, token.OR); }
    }
    else if (c == '+') { return binop(rdr, token.PLUS); }
    else if (c == '*') { return binop(rdr, token.STAR); }
    else if (c == '/') { return binop(rdr, token.SLASH); }
    else if (c == '^') { return binop(rdr, token.CARET); }
    else if (c == '%') { return binop(rdr, token.PERCENT); }
    else {
          fatal_span_char(rdr, rdr.last_pos, rdr.pos,
                          "unknown start of token", c);
    }
}

function consume_whitespace(rdr) {
    while (is_whitespace(rdr.curr) && !is_eof(rdr)) { bump(rdr); }
}
