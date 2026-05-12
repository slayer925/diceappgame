"use strict";

/** @brief 3d dice roller web app
 *  @author Sarah Rosanna Busch
 *  @date 10 Aug 2023
 *  @version 0.1
 */

window.onkeydown = function(e) {
    //console.log(e.code);
    if(e.code === "Enter" || e.code === "Escape") {
        main.setInput(); //closes numPad
    }
}

 var main = (function() {
    var that = {}; 
    var elem = {}; 
    var vars = {
        numpadShowing: false,
        lastVal: '',
        userTyping: false
    }
    var box = null;
    var diceConfig = []; // per-die options: [{diceColor, labelColor, faceLabels}, ...]

    // Number of distinct face values per die type (used to build symbol input placeholders)
    var FACE_VALUE_COUNTS = { d4: 4, d6: 6, d8: 8, d9: 10, d10: 10, d12: 12, d20: 20, d100: 10 };
    var DEFAULT_DICE_COLOR = '#202020';
    var DEFAULT_LABEL_COLOR = '#aaaaaa';

    that.init = function() {
        elem.container = $t.id('diceRoller');
        elem.result = $t.id('result');
        elem.textInput = $t.id('textInput'); 
        elem.numPad = $t.id('numPad');
        elem.instructions = $t.id('instructions');
        elem.center_div = $t.id('center_div');
        elem.diceLimit = $t.id('diceLimit');
        elem.customizePanel = $t.id('customizePanel');
        elem.diceConfigRows = $t.id('diceConfigRows');

        box = new DICE.dice_box(elem.container);
        box.bind_swipe(elem.center_div, before_roll, after_roll);

        $t.bind(elem.textInput, 'change', function(ev) { //shows instructions
            show_instructions(); 
        }); 
        $t.bind(elem.textInput, 'input', function(ev) { 
            let size = elem.textInput.value.length;
            elem.textInput.size = size > 0 ? size : 1;
            box.setDice(elem.textInput.value);
        });
        $t.bind(elem.textInput, 'focus', function(ev) {
            elem.diceLimit.style.display = 'none';
            //ev.preventDefault();
            if(!vars.numpadShowing) {
                show_instructions(false);
                show_numPad(true);
            } else if(vars.userTyping) {
                _handleInput();
                vars.userTyping = false;
            }
        });
        $t.bind(elem.textInput, 'blur', function(ev) {
            //necessary to do this here for iOS compatibility
            //because they put cursor back to zero on blur
            vars.caretPos = elem.textInput.selectionStart;
            vars.selectionEnd = elem.textInput.selectionEnd;
        });
        $t.bind(elem.textInput, 'mouseup', function(ev) {
            ev.preventDefault();
        });

        box.setDice(elem.textInput.value);
        //box.start_throw(); //start by throwing all the dice on the table

        show_instructions(true);
    }

    that.setInput = function() {
        let inputVal = elem.textInput.value;
        //check for d100 and add tens place die
        if(inputVal.includes('d100')) {
            let dIdx = inputVal.indexOf('d100');
            let numD100 = '';
            for(let i = dIdx - 1; i >= 0; i--) {
                let digit = inputVal[i];
                if(!isNaN(digit)) {
                    numD100 = digit + numD100;
                } else {
                    break;
                }                
            }
            if(numD100 === '') numD100 = '1';
            //console.log('num d100s: ' + numD100);
            for(let i = 0; i < parseInt(numD100, 10); i++) {
                inputVal += '+d9';
            }
        }
        //check for too many dice
        let d = DICE.parse_notation(inputVal);
        let numDice = d.set.length;
        if(numDice > 20) {
            elem.diceLimit.style.display = 'block';
        } else {
            box.setDice(inputVal);
            show_numPad(false);
            show_instructions(true);
        }
    }

    that.clearInput = function() {
        elem.textInput.value = '';
    }

    //called from numPad onclicks
    that.input = function(value) {
        vars.lastVal = value;
        vars.userTyping = true;
        elem.textInput.focus();
    }

    // ---- CUSTOMIZE PANEL ----

    that.showCustomize = function() {
        var notation = DICE.parse_notation(elem.textInput.value);
        if (notation.set.length === 0) return;
        show_numPad(false);
        show_instructions(false);
        _buildCustomizeRows(notation.set);
        elem.customizePanel.style.display = 'inline-block';
    }

    that.applyCustomize = function() {
        var rows = elem.diceConfigRows.querySelectorAll('.dice-config-row');
        diceConfig = [];
        rows.forEach(function(row, i) {
            var type = row.dataset.type || '';
            var diceColor = row.querySelector('.dc-body').value;
            var labelColor = row.querySelector('.dc-label').value;
            var symbolsRaw = row.querySelector('.dc-symbols').value.trim();
            var faceLabels = symbolsRaw ? symbolsRaw.split(',').map(function(s) { return s.trim(); }) : [];
            diceConfig[i] = { _type: type, diceColor: diceColor, labelColor: labelColor, faceLabels: faceLabels };
        });
        box.setDiceOptions(diceConfig);
        elem.customizePanel.style.display = 'none';
        show_instructions(true);
    }

    that.cancelCustomize = function() {
        elem.customizePanel.style.display = 'none';
        show_instructions(true);
    }

    that.resetCustomize = function() {
        diceConfig = [];
        box.setDiceOptions([]);
        var rows = elem.diceConfigRows.querySelectorAll('.dice-config-row');
        rows.forEach(function(row) {
            row.querySelector('.dc-body').value = DEFAULT_DICE_COLOR;
            row.querySelector('.dc-label').value = DEFAULT_LABEL_COLOR;
            row.querySelector('.dc-symbols').value = '';
        });
    }

    function _buildCustomizeRows(diceSet) {
        elem.diceConfigRows.innerHTML = '';
        diceSet.forEach(function(type, i) {
            // Only restore saved config if it was recorded for the same die type at this position
            var stored = (diceConfig[i] && diceConfig[i]._type === type) ? diceConfig[i] : {};
            var faceCount = FACE_VALUE_COUNTS[type] || 6;
            var placeholder = [];
            for (var f = 1; f <= Math.min(faceCount, 6); f++) placeholder.push('sym' + f);
            if (faceCount > 6) placeholder.push('...');

            // Escape special characters so they don't break the value="..." HTML attribute
            var symbolsVal = ((stored.faceLabels || []).join(','))
                .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                .replace(/</g, '&lt;').replace(/>/g, '&gt;');

            var row = document.createElement('div');
            row.className = 'dice-config-row';
            row.dataset.type = type;
            row.innerHTML =
                '<span class="dc-type">' + type + '</span>' +
                '<label>Body <input type="color" class="dc-body" value="' + (stored.diceColor || DEFAULT_DICE_COLOR) + '"></label>' +
                '<label>Label <input type="color" class="dc-label" value="' + (stored.labelColor || DEFAULT_LABEL_COLOR) + '"></label>' +
                '<label class="dc-sym-label">Symbols ' +
                    '<input type="text" class="dc-symbols" placeholder="' + placeholder.join(',') + '" ' +
                    'value="' + symbolsVal + '">' +
                '</label>';
            elem.diceConfigRows.appendChild(row);
        });
    }

    // ---- END CUSTOMIZE PANEL ----

    function _handleInput() {
        let text = elem.textInput.value;
        let selectedText = (vars.caretPos === vars.selectionEnd) ? false : true;
        if(vars.lastVal === "del") {
            if(selectedText) {
                deleteText();
            } else {
                text = text.substring(0, vars.caretPos) + text.substring(vars.caretPos+1, text.length);
            }
        } else if(vars.lastVal === "bksp") {
            if(selectedText) {
                deleteText();
            } else {
                text = text.substring(0, vars.caretPos-1) + text.substring(vars.caretPos, text.length);
                vars.caretPos--;
            }
        } else {
            deleteText();
            text = text.substring(0, vars.caretPos) + vars.lastVal + text.substring(vars.caretPos, text.length);
            vars.caretPos++;
        }
        elem.textInput.value = text;
        setTimeout(() => {
            elem.textInput.setSelectionRange(vars.caretPos, vars.caretPos);
        }, 1);

        function deleteText() {
            text = text.substring(0, vars.caretPos) + text.substring(vars.selectionEnd, text.length);
            setTimeout(() => {
                elem.textInput.setSelectionRange(vars.caretPos, vars.caretPos);
            }, 1);
        }
    }

    // show 'Roll Dice' swipe instructions
    // param show = bool
    function show_instructions(show) {
        if(show) {
            elem.instructions.style.display = 'inline-block';
        } else {
            elem.instructions.style.display = 'none';
        }
    }

    // show input options
    // param show = bool
    function show_numPad(show) {
        if(show) {
            vars.numpadShowing = true;
            elem.numPad.style.display = 'inline-block';
            elem.textInput.focus();
        } else {
            vars.numpadShowing = false;
            elem.textInput.blur();
            elem.numPad.style.display = 'none';
        }
    }

    // @brief callback function called when dice roll event starts
    // @param notation indicates which dice are going to roll
    // @return null for random result || array of desired results
    function before_roll(notation) {
        //console.log('before_roll notation: ' + JSON.stringify(notation));
        show_instructions(false);
        elem.result.innerHTML = '';       
        return null;
    }

    // @brief callback function called once dice stop moving
    // @param notation now includes results
    function after_roll(notation) {
        //console.log('after_roll notation: ' + JSON.stringify(notation));
        if(notation.result[0] < 0) {
            elem.result.innerHTML = "Oops, your dice fell off the table. <br> Refresh and roll again."
        } else {
            elem.result.innerHTML = notation.resultString;
        }
    }

    return that;
}());
