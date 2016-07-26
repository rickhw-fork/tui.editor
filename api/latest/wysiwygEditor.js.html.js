tui.util.defineNamespace("fedoc.content", {});
fedoc.content["wysiwygEditor.js.html"] = "      <div id=\"main\" class=\"main\">\n\n\n\n    \n    <section>\n        <article>\n            <pre class=\"prettyprint source linenums\"><code>/**\n * @fileoverview Implments wysiwygEditor\n * @author Sungho Kim(sungho-kim@nhnent.com) FE Development Team/NHN Ent.\n */\n\n'use strict';\n\nvar domUtils = require('./domUtils'),\n    WwClipboardManager = require('./wwClipboardManager'),\n    WwSelectionMarker = require('./wwSelectionMarker'),\n    WwListManager = require('./wwListManager'),\n    WwTaskManager = require('./wwTaskManager'),\n    WwTableManager = require('./wwTableManager'),\n    WwHrManager = require('./wwHrManager'),\n    WwPManager = require('./wwPManager'),\n    WwHeadingManager = require('./wwHeadingManager'),\n    WwCodeBlockManager = require('./wwCodeBlockManager'),\n    SquireExt = require('./squireExt');\n\nvar keyMapper = require('./keyMapper').getSharedInstance();\n\nvar WwTextObject = require('./wwTextObject');\n\nvar util = tui.util;\n\nvar FIND_EMPTY_LINE = /&lt;(.+)>(&lt;br>|&lt;br \\/>|&lt;BR>|&lt;BR \\/>)&lt;\\/\\1>/g,\n    FIND_UNNECESSARY_BR = /(?:&lt;br>|&lt;br \\/>|&lt;BR>|&lt;BR \\/>)&lt;\\/(.+?)>/g,\n    FIND_BLOCK_TAGNAME_RX = /\\b(H[\\d]|LI|P|BLOCKQUOTE|TD|PRE)\\b/;\n\nvar EDITOR_CONTENT_CSS_CLASSNAME = 'tui-editor-contents';\n\nvar canObserveMutations = (typeof MutationObserver !== 'undefined');\n\n/**\n * WysiwygEditor\n * @exports WysiwygEditor\n * @constructor\n * @class WysiwygEditor\n * @param {jQuery} $el element to insert editor\n * @param {EventManager} eventManager EventManager instance\n */\nfunction WysiwygEditor($el, eventManager) {\n    this.eventManager = eventManager;\n    this.$editorContainerEl = $el;\n\n    this._height = 0;\n\n    this._silentChange = false;\n\n    this._keyEventHandlers = {};\n    this._managers = {};\n\n    this._clipboardManager = new WwClipboardManager(this);\n    this._selectionMarker = new WwSelectionMarker();\n\n    this._initEvent();\n    this._initDefaultKeyEventHandler();\n\n    this.postProcessForChange = util.debounce(function() {\n        this._postProcessForChange();\n    }.bind(this), 0);\n}\n\n/**\n * init\n * @api\n * @memberOf WysiwygEditor\n */\nWysiwygEditor.prototype.init = function() {\n    var $editorBody = $('&lt;div />');\n\n    this.$editorContainerEl.append($editorBody);\n\n    this.editor = new SquireExt($editorBody[0], {\n        blockTag: 'DIV'\n    });\n\n    this._initSquireEvent();\n    this._clipboardManager.init();\n\n    this.get$Body().addClass(EDITOR_CONTENT_CSS_CLASSNAME);\n    this.$editorContainerEl.css('position', 'relative');\n};\n\n/**\n * _preprocessForInlineElement\n * Seperate anchor tags with \\u200B and replace blank space between &lt;br> and &lt;img to &lt;br>$1\n * @param {string} html Inner html of content editable\n * @returns {string}\n * @memberOf WysiwygEditor\n * @private\n */\nWysiwygEditor.prototype._preprocessForInlineElement = function(html) {\n    return html.replace(/&lt;br>( *)&lt;img/g, '&lt;br>&lt;br>$1&lt;img');\n};\n/**\n * _initEvent\n * Initialize EventManager event handler\n * @memberOf WysiwygEditor\n * @private\n */\nWysiwygEditor.prototype._initEvent = function() {\n    var self = this;\n\n    this.eventManager.listen('wysiwygSetValueBefore', function(html) {\n        return self._preprocessForInlineElement(html);\n    });\n\n    this.eventManager.listen('wysiwygSetValueAfter', function() {\n        self._wrapDefaultBlockToListInner();\n    });\n\n    this.eventManager.listen('wysiwygKeyEvent', function(ev) {\n        self._runKeyEventHandlers(ev.data, ev.keyMap);\n    });\n};\n\n/**\n * addKeyEventHandler\n * Add key event handler\n * @api\n * @memberOf WysiwygEditor\n * @param {string} keyMap keyMap string\n * @param {function} handler handler\n */\nWysiwygEditor.prototype.addKeyEventHandler = function(keyMap, handler) {\n    if (!handler) {\n        handler = keyMap;\n        keyMap = 'DEFAULT';\n    }\n\n    if (!this._keyEventHandlers[keyMap]) {\n        this._keyEventHandlers[keyMap] = [];\n    }\n\n    this._keyEventHandlers[keyMap].push(handler);\n};\n\n/**\n * _runKeyEventHandlers\n * Run key event handler\n * @param {Event} event event object\n * @param {string} keyMap keyMapString\n * @private\n */\nWysiwygEditor.prototype._runKeyEventHandlers = function(event, keyMap) {\n    var range = this.getRange(),\n        handlers, isNeedNext;\n\n    handlers = this._keyEventHandlers.DEFAULT;\n\n    if (handlers) {\n        util.forEachArray(handlers, function(handler) {\n            isNeedNext = handler(event, range, keyMap);\n\n            return isNeedNext;\n        });\n    }\n\n    handlers = this._keyEventHandlers[keyMap];\n\n    if (handlers &amp;&amp; isNeedNext !== false) {\n        util.forEachArray(handlers, function(handler) {\n            return handler(event, range, keyMap);\n        });\n    }\n};\n\n/**\n * _initSquireEvent\n * Initialize squire event\n * @private\n */\nWysiwygEditor.prototype._initSquireEvent = function() {\n    var self = this;\n    var isNeedFirePostProcessForRangeChange = false;\n\n    this.getEditor().addEventListener('paste', function(clipboardEvent) {\n        self.eventManager.emit('paste', {\n            source: 'wysiwyg',\n            data: clipboardEvent\n        });\n    });\n\n    this.getEditor().addEventListener('dragover', function(ev) {\n        ev.preventDefault();\n\n        return false;\n    });\n\n    this.getEditor().addEventListener('drop', function(ev) {\n        ev.preventDefault();\n\n        self.eventManager.emit('drop', {\n            source: 'wysiwyg',\n            data: ev\n        });\n\n        return false;\n    });\n\n    //no-iframe전환후 레인지가 업데이트 되기 전에 이벤트가 발생함\n    //그래서 레인지 업데이트 이후 체인지 관련 이벤트 발생\n    this.getEditor().addEventListener('input', util.debounce(function() {\n        var eventObj;\n\n        if (!self._silentChange &amp;&amp; self.isEditorValid()) {\n            eventObj = {\n                source: 'wysiwyg'\n            };\n\n            self.eventManager.emit('changeFromWysiwyg', eventObj);\n            self.eventManager.emit('change', eventObj);\n            self.eventManager.emit('contentChangedFromWysiwyg', self);\n        } else {\n            self._silentChange = false;\n        }\n\n        self.getEditor().preserveLastLine();\n    }, 0));\n\n    this.getEditor().addEventListener('keydown', function(keyboardEvent) {\n        var range = self.getEditor().getSelection();\n\n        if (!range.collapsed) {\n            isNeedFirePostProcessForRangeChange = true;\n        }\n\n        self.eventManager.emit('keydown', {\n            source: 'wysiwyg',\n            data: keyboardEvent\n        });\n\n        self._onKeyDown(keyboardEvent);\n    });\n\n    if (util.browser.firefox) {\n        this.getEditor().addEventListener('keypress', function(keyboardEvent) {\n            var keyCode = keyboardEvent.keyCode;\n            var range;\n\n            if (keyCode === 13 || keyCode === 9) {\n                range = self.getEditor().getSelection();\n\n                if (!range.collapsed) {\n                    isNeedFirePostProcessForRangeChange = true;\n                }\n\n                self.eventManager.emit('keydown', {\n                    source: 'wysiwyg',\n                    data: keyboardEvent\n                });\n\n                self._onKeyDown(keyboardEvent);\n            }\n        });\n\n        //파폭에서 space입력시 텍스트노드가 분리되는 현상때문에 꼭 다시 머지해줘야한다..\n        //이렇게 하지 않으면 textObject에 문제가 생긴다.\n        self.getEditor().addEventListener('keyup', function() {\n            var range, prevLen, curEl;\n\n            range = self.getRange();\n\n            if (domUtils.isTextNode(range.commonAncestorContainer)\n                &amp;&amp; domUtils.isTextNode(range.commonAncestorContainer.previousSibling)) {\n                prevLen = range.commonAncestorContainer.previousSibling.length;\n                curEl = range.commonAncestorContainer;\n\n                range.commonAncestorContainer.previousSibling.appendData(\n                    range.commonAncestorContainer.data);\n\n                range.setStart(range.commonAncestorContainer.previousSibling, prevLen + range.startOffset);\n                range.collapse(true);\n\n                curEl.parentNode.removeChild(curEl);\n\n                self.getEditor().setSelection(range);\n                range.detach();\n            }\n        });\n    }\n\n    this.getEditor().addEventListener('keyup', function(keyboardEvent) {\n        if (isNeedFirePostProcessForRangeChange) {\n            self.postProcessForChange();\n            isNeedFirePostProcessForRangeChange = false;\n        }\n\n        self.eventManager.emit('keyup', {\n            source: 'wysiwyg',\n            data: keyboardEvent\n        });\n    });\n\n    this.getEditor().addEventListener('scroll', function(ev) {\n        self.eventManager.emit('scroll', {\n            source: 'wysiwyg',\n            data: ev\n        });\n    });\n\n    this.getEditor().addEventListener('click', function(ev) {\n        self.eventManager.emit('click', {\n            source: 'wysiwyg',\n            data: ev\n        });\n    });\n\n    this.getEditor().addEventListener('mousedown', function(ev) {\n        self.eventManager.emit('mousedown', {\n            source: 'wysiwyg',\n            data: ev\n        });\n    });\n\n    this.getEditor().addEventListener('mouseup', function(ev) {\n        self.eventManager.emit('mouseup', {\n            source: 'wysiwyg',\n            data: ev\n        });\n    });\n\n    this.getEditor().addEventListener('contextmenu', function(ev) {\n        self.eventManager.emit('contextmenu', {\n            source: 'wysiwyg',\n            data: ev\n        });\n    });\n\n    this.getEditor().addEventListener('focus', function() {\n        self.eventManager.emit('focus', {\n            source: 'wysiwyg'\n        });\n    });\n\n    this.getEditor().addEventListener('blur', function() {\n        self.eventManager.emit('blur', {\n            source: 'wysiwyg'\n        });\n    });\n\n    this.getEditor().addEventListener('pathChange', function(data) {\n        var isInPreTag = /PRE/.test(data.path);\n        var isInCodeTag = />CODE$/.test(data.path);\n        var state = {\n            bold: /(>B)|(>STRONG)/.test(data.path),\n            italic: /(>I)|(>EM)/.test(data.path),\n            code: !isInPreTag &amp;&amp; isInCodeTag,\n            codeBlock: isInPreTag &amp;&amp; isInCodeTag,\n            source: 'wysiwyg'\n        };\n\n        self.eventManager.emit('stateChange', state);\n    });\n};\n\n/**\n * Handler of keydown event\n * @param {object} keyboardEvent Event object\n * @private\n */\nWysiwygEditor.prototype._onKeyDown = function(keyboardEvent) {\n    var keyMap = keyMapper.convert(keyboardEvent);\n\n    //to avoid duplicate event firing in firefox\n    if (keyboardEvent.keyCode) {\n        this.eventManager.emit('keyMap', {\n            source: 'wysiwyg',\n            keyMap: keyMap,\n            data: keyboardEvent\n        });\n\n        this.eventManager.emit('wysiwygKeyEvent', {\n            keyMap: keyMap,\n            data: keyboardEvent\n        });\n    }\n};\n\n/**\n * _initDefaultKeyEventHandler\n * Initialize default event handler\n * @private\n */\nWysiwygEditor.prototype._initDefaultKeyEventHandler = function() {\n    var self = this;\n\n    this.addKeyEventHandler('ENTER', function() {\n        self.defer(function() {\n            self._scrollToRangeIfNeed();\n        });\n    });\n\n    this.addKeyEventHandler('TAB', function(ev) {\n        var editor = self.getEditor();\n        var isAbleToInsert4Space = !self.getManager('list').isInList();\n\n        if (isAbleToInsert4Space) {\n            ev.preventDefault();\n            editor.insertPlainText('\\u00a0\\u00a0\\u00a0\\u00a0');\n\n            return false;\n        }\n\n        return true;\n    });\n};\n\n/**\n * Scroll editor area to current cursor position if need\n * @private\n */\nWysiwygEditor.prototype._scrollToRangeIfNeed = function() {\n    var range = this.getEditor().getSelection().cloneRange();\n    var cursorTop = this.getEditor().getCursorPosition(range).top - this.$editorContainerEl.offset().top;\n\n    if (cursorTop >= this.get$Body().height()) {\n        range.endContainer.scrollIntoView();\n    }\n};\n\n/**\n * _isInOrphanText\n * check if range is orphan text\n * @param {Range} range range\n * @returns {boolean} result\n * @private\n */\nWysiwygEditor.prototype._isInOrphanText = function(range) {\n    return range.startContainer.nodeType === Node.TEXT_NODE\n           &amp;&amp; range.startContainer.parentNode === this.get$Body()[0];\n};\n\n/**\n * _wrapDefaultBlockTo\n * Wrap default block to passed range\n * @param {Range} range range\n * @private\n */\nWysiwygEditor.prototype._wrapDefaultBlockTo = function(range) {\n    var block, textElem, cursorOffset, insertTargetNode;\n\n    this.saveSelection(range);\n    this._joinSplitedTextNodes();\n    this.restoreSavedSelection();\n\n    range = this.getEditor().getSelection().cloneRange();\n\n    textElem = range.startContainer;\n    cursorOffset = range.startOffset;\n\n    //이때 range의 정보들이 body기준으로 변경된다(텍스트 노드가 사라져서)\n    //after code below, range range is arranged by body\n    block = this.getEditor().createDefaultBlock([range.startContainer]);\n\n    //range for insert block\n    insertTargetNode = domUtils.getChildNodeByOffset(range.startContainer, range.startOffset);\n    if (insertTargetNode) {\n        range.setStartBefore(insertTargetNode);\n    } else {\n        //컨테이너의 차일드가 이노드 한개뿐일경우\n        range.selectNodeContents(range.startContainer);\n    }\n\n    range.collapse(true);\n\n    range.insertNode(block);\n\n    //revert range to original node\n    range.setStart(textElem, cursorOffset);\n    range.collapse(true);\n\n    this.getEditor().setSelection(range);\n};\n\n/**\n * findTextNodeFilter\n * @this Node\n * @returns {boolean} true or not\n */\nfunction findTextNodeFilter() {\n    return this.nodeType === Node.TEXT_NODE;\n}\n\n/**\n * _joinSplitedTextNodes\n * Join spliated text nodes\n * @private\n */\nWysiwygEditor.prototype._joinSplitedTextNodes = function() {\n    var textNodes, prevNode,\n        lastGroup,\n        nodesToRemove = [];\n\n    textNodes = this.get$Body().contents().filter(findTextNodeFilter);\n\n    textNodes.each(function(i, node) {\n        if (prevNode === node.previousSibling) {\n            lastGroup.nodeValue += node.nodeValue;\n            nodesToRemove.push(node);\n        } else {\n            lastGroup = node;\n        }\n\n        prevNode = node;\n    });\n\n    $(nodesToRemove).remove();\n};\n\n\n/**\n * saveSelection\n * Save current selection before modification\n * @api\n * @memberOf WysiwygEditor\n * @param {Range} range Range object\n */\nWysiwygEditor.prototype.saveSelection = function(range) {\n    var sq = this.getEditor();\n\n    if (!range) {\n        range = sq.getSelection().cloneRange();\n    }\n\n    this.getEditor()._saveRangeToBookmark(range);\n};\n\n/**\n * restoreSavedSelection\n * Restore saved selection\n * @api\n * @memberOf WysiwygEditor\n */\nWysiwygEditor.prototype.restoreSavedSelection = function() {\n    var sq = this.getEditor();\n    sq.setSelection(sq._getRangeAndRemoveBookmark());\n};\n\n/**\n * _wrapDefaultBlockToListInner\n * Wrap default block to list inner contents\n * @private\n */\nWysiwygEditor.prototype._wrapDefaultBlockToListInner = function() {\n    this.get$Body().find('li').each(function(index, node) {\n        if ($(node).find('div').length &lt;= 0) {\n            $(node).wrapInner('&lt;div />');\n        }\n    });\n};\n\n/**\n * reset\n * Reset wysiwyg editor\n * @api\n * @memberOf WysiwygEditor\n */\nWysiwygEditor.prototype.reset = function() {\n    this.setValue('');\n};\n\n/**\n * changeBlockFormatTo\n * Change current range block format to passed tag\n * @api\n * @memberOf WysiwygEditor\n * @param {string} targetTagName Target element tag name\n */\nWysiwygEditor.prototype.changeBlockFormatTo = function(targetTagName) {\n    this.getEditor().changeBlockFormatTo(targetTagName);\n    this.eventManager.emit('wysiwygRangeChangeAfter', this);\n};\n\n/**\n * makeEmptyBlockCurrentSelection\n * Make empty block to current selection\n * @api\n * @memberOf WysiwygEditor\n */\nWysiwygEditor.prototype.makeEmptyBlockCurrentSelection = function() {\n    var self = this;\n\n    this.getEditor().modifyBlocks(function(frag) {\n        if (!frag.textContent) {\n            frag = self.getEditor().createDefaultBlock();\n        }\n\n        return frag;\n    });\n};\n\n/**\n * focus\n * Focus to editor\n * @api\n * @memberOf WysiwygEditor\n */\nWysiwygEditor.prototype.focus = function() {\n    this.editor.focus();\n};\n\n/**\n * remove\n * Remove wysiwyg editor\n * @api\n * @memberOf WysiwygEditor\n */\nWysiwygEditor.prototype.remove = function() {\n    this.getEditor().destroy();\n\n    this.editor = null;\n    this.$body = null;\n};\n\n/**\n * setHeight\n * Set editor height\n * @api\n * @memberOf WysiwygEditor\n * @param {number|string} height pixel of height or \"auto\"\n */\nWysiwygEditor.prototype.setHeight = function(height) {\n    this._height = height;\n\n    if (height === 'auto') {\n        this.get$Body().css('overflow', 'visible');\n        this.get$Body().css('height', 'auto');\n    } else {\n        this.get$Body().css('overflow', 'auto');\n        this.get$Body().css('height', '100%');\n        this.$editorContainerEl.height(height);\n    }\n};\n\n/**\n * setValue\n * Set value to wysiwyg editor\n * @api\n * @memberOf WysiwygEditor\n * @param {string} html HTML text\n */\nWysiwygEditor.prototype.setValue = function(html) {\n    html = this.eventManager.emitReduce('wysiwygSetValueBefore', html);\n\n    this.editor.setHTML(html);\n\n    this.eventManager.emit('wysiwygSetValueAfter', this);\n    this.eventManager.emit('contentChangedFromWysiwyg', this);\n\n    this.moveCursorToEnd();\n\n    this.getEditor().preserveLastLine();\n\n    this.getEditor().removeLastUndoStack();\n    this.getEditor().saveUndoState();\n};\n\n/**\n * getValue\n * Get value of wysiwyg editor\n * @api\n * @memberOf WysiwygEditor\n * @returns {string} html\n */\nWysiwygEditor.prototype.getValue = function() {\n    var html;\n\n    this._prepareGetHTML();\n\n    html = this.editor.getHTML();\n\n    //empty line replace to br\n    html = html.replace(FIND_EMPTY_LINE, function(match, tag) {\n        var result;\n\n        //we maintain empty list\n        if (tag === 'li') {\n            result = match;\n        //we maintain empty table\n        } else if (tag === 'td' || tag === 'th') {\n            result = '&lt;' + tag + '>&lt;/' + tag + '>';\n        } else {\n            result = '&lt;br />';\n        }\n\n        return result;\n    });\n\n    //remove unnecessary brs\n    html = html.replace(FIND_UNNECESSARY_BR, '&lt;/$1>');\n\n    //remove contenteditable block, in this case div\n    html = html.replace(/&lt;div>/g, '');\n    html = html.replace(/&lt;\\/div>/g, '&lt;br />');\n\n    html = this.eventManager.emitReduce('wysiwygProcessHTMLText', html);\n\n    return html;\n};\n\n/**\n * _prepareGetHTML\n * Prepare before get html\n * @memberOf WysiwygEditor\n * @private\n */\nWysiwygEditor.prototype._prepareGetHTML = function() {\n    var self = this;\n    //for ensure to fire change event\n    self.get$Body().attr('lastGetValue', Date.now());\n\n    self._joinSplitedTextNodes();\n\n    self.getEditor().modifyDocument(function() {\n        self.eventManager.emit('wysiwygGetValueBefore', self);\n    });\n};\n\n/**\n * _postProcessForChange\n * Post process for change\n * @private\n * @memberOf WysiwygEditor\n */\nWysiwygEditor.prototype._postProcessForChange = function() {\n    var self = this;\n    self.getEditor().modifyDocument(function() {\n        self.eventManager.emit('wysiwygRangeChangeAfter', self);\n    });\n};\n\n/**\n * readySilentChange\n * Ready to silent change\n * @api\n * @memberOf WysiwygEditor\n */\nWysiwygEditor.prototype.readySilentChange = function() {\n    if (canObserveMutations &amp;&amp; !this.getEditor().isIgnoreChange()) {\n        this._silentChange = true;\n    }\n};\n\n/**\n * getEditor\n * Get squire\n * @api\n * @memberOf WysiwygEditor\n * @returns {SquireExt} squire\n */\nWysiwygEditor.prototype.getEditor = function() {\n    return this.editor;\n};\n\n/**\n * replaceSelection\n * Replace text of passed range\n * @api\n * @memberOf WysiwygEditor\n * @param {string} content Content for change current selection\n * @param {Range} range range\n */\nWysiwygEditor.prototype.replaceSelection = function(content, range) {\n    this.getEditor().replaceSelection(content, range);\n};\n\n/**\n * replaceRelativeOffset\n * Replace content by relative offset\n * @api\n * @memberOf WysiwygEditor\n * @param {string} content Content for change current selection\n * @param {number} offset Offset of current range\n * @param {number} overwriteLength Length to overwrite content\n */\nWysiwygEditor.prototype.replaceRelativeOffset = function(content, offset, overwriteLength) {\n    this.getEditor().replaceRelativeOffset(content, offset, overwriteLength);\n};\n\n/**\n * addWidget\n * Add widget to selection\n * @api\n * @memberOf WysiwygEditor\n * @param {Range} range Range object\n * @param {Node} node Widget node\n * @param {string} style Adding style \"over\" or \"bottom\"\n * @param {number} [offset] Offset to adjust position\n */\nWysiwygEditor.prototype.addWidget = function(range, node, style, offset) {\n    var pos = this.getEditor().getSelectionPosition(range, style, offset);\n    var editorContainerPos = this.$editorContainerEl.offset();\n\n    this.$editorContainerEl.append(node);\n\n    $(node).css({\n        position: 'absolute',\n        top: pos.top - editorContainerPos.top,\n        left: pos.left - editorContainerPos.left\n    });\n};\n\n/**\n * get$Body\n * Get jQuery wrapped body container of Squire\n * @api\n * @memberOf WysiwygEditor\n * @returns {JQuery} jquery body\n */\nWysiwygEditor.prototype.get$Body = function() {\n    return this.getEditor().get$Body();\n};\n\n/**\n * hasFormatWithRx\n * Check with given regexp whether current path has some format or not\n * @api\n * @memberOf WysiwygEditor\n * @param {RegExp} rx Regexp\n * @returns {boolean} Match result\n */\nWysiwygEditor.prototype.hasFormatWithRx = function(rx) {\n    return this.getEditor().getPath().match(rx);\n};\n\n/**\n * breakToNewDefaultBlock\n * Break line to new default block from passed range\n * @api\n * @memberOf WysiwygEditor\n * @param {Range} range Range object\n * @param {string} [where] \"before\" or not\n */\nWysiwygEditor.prototype.breakToNewDefaultBlock = function(range, where) {\n    var div, appendBefore, currentNode;\n\n    currentNode = domUtils.getChildNodeByOffset(range.startContainer, range.startOffset)\n        || domUtils.getChildNodeByOffset(range.startContainer, range.startOffset - 1);\n\n    appendBefore = domUtils.getParentUntil(currentNode, this.get$Body()[0]);\n\n    div = this.editor.createDefaultBlock();\n\n    if (where === 'before') {\n        $(appendBefore).before(div);\n    } else {\n        $(appendBefore).after(div);\n    }\n\n    range.setStart(div, 0);\n    range.collapse(true);\n    this.editor.setSelection(range);\n};\n\n\n/**\n * replaceContentText\n * Replace textContet of node\n * @api\n * @memberOf WysiwygEditor\n * @param {Node} container Container node\n * @param {string} from Target text to change\n * @param {string} to Replacement text\n */\nWysiwygEditor.prototype.replaceContentText = function(container, from, to) {\n    var before;\n\n    before = $(container).html();\n    $(container).html(before.replace(from, to));\n};\n\n/**\n * unwrapBlockTag\n * Unwrap Block tag of current range\n * @api\n * @memberOf WysiwygEditor\n * @param {function} [condition] iterate with tagName\n */\nWysiwygEditor.prototype.unwrapBlockTag = function(condition) {\n    if (!condition) {\n        condition = function(tagName) {\n            return FIND_BLOCK_TAGNAME_RX.test(tagName);\n        };\n    }\n\n    this.getEditor().changeBlockFormat(condition);\n    this.eventManager.emit('wysiwygRangeChangeAfter', this);\n};\n\n/**\n * insertSelectionMarker\n * Insert selection marker\n * @api\n * @memberOf WysiwygEditor\n * @param {Range} range Range to save selection\n * @returns {Range} range\n */\nWysiwygEditor.prototype.insertSelectionMarker = function(range) {\n    return this._selectionMarker.insertMarker(range, this.getEditor());\n};\n\n/**\n * restoreSelectionMarker\n * Restore marker to selection\n * @api\n * @memberOf WysiwygEditor\n * @returns {Range} range\n */\nWysiwygEditor.prototype.restoreSelectionMarker = function() {\n    return this._selectionMarker.restore(this.getEditor());\n};\n\n/**\n * addManager\n * Add manager\n * @api\n * @memberOf WysiwygEditor\n * @param {string} name Manager name\n * @param {function} Manager Constructor\n */\nWysiwygEditor.prototype.addManager = function(name, Manager) {\n    var instance;\n\n    if (!Manager) {\n        Manager = name;\n        name = null;\n    }\n\n    instance = new Manager(this);\n    this._managers[name || instance.name] = instance;\n};\n\n/**\n * getManager\n * Get manager by manager name\n * @api\n * @memberOf WysiwygEditor\n * @param {string} name Manager name\n * @returns {object} manager\n */\nWysiwygEditor.prototype.getManager = function(name) {\n    return this._managers[name];\n};\n\n/**\n * Set cursor position to end\n * @api\n * @memberOf WysiwygEditor\n */\nWysiwygEditor.prototype.moveCursorToEnd = function() {\n    this.getEditor().moveCursorToEnd();\n    this.getEditor().scrollTop(this.get$Body().height());\n    this._correctRangeAfterMoveCursor('end');\n};\n\n/**\n * Set cursor position to start\n * @api\n * @memberOf WysiwygEditor\n */\nWysiwygEditor.prototype.moveCursorToStart = function() {\n    this.getEditor().moveCursorToStart();\n    this.getEditor().scrollTop(0);\n};\n\n/**\n * Set cursor position to start\n * @api\n * @memberOf WysiwygEditor\n * @param {number} value Scroll amount\n * @returns {boolean}\n */\nWysiwygEditor.prototype.scrollTop = function(value) {\n    return this.getEditor().scrollTop(value);\n};\n\n/**\n * _correctRangeAfterMoveCursor\n * For arrange Range after moveCursorToEnd api invocation. Squire has bug in Firefox, IE.\n * @memberOf WysiwygEditor\n * @param {string} direction Direction of cursor move\n * @private\n */\nWysiwygEditor.prototype._correctRangeAfterMoveCursor = function(direction) {\n    var range = this.getEditor().getSelection().cloneRange();\n    var cursorContainer, offset;\n\n    if (direction === 'start') {\n        cursorContainer = this.get$Body()[0].firstChild;\n        offset = 0;\n    } else {\n        cursorContainer = this.get$Body()[0].lastChild;\n        offset = domUtils.getOffsetLength(cursorContainer);\n\n        // IE have problem with cursor after br\n        if (domUtils.getNodeName(cursorContainer.lastChild) === 'BR') {\n            offset -= 1;\n        }\n    }\n\n    range.setStart(cursorContainer, offset);\n\n    range.collapse(true);\n\n    this.getEditor().setSelection(range);\n};\n\n/**\n * Get current Range object\n * @api\n * @memberOf WysiwygEditor\n * @returns {Range}\n */\nWysiwygEditor.prototype.getRange = function() {\n    return this.getEditor().getSelection().cloneRange();\n};\n\n/**\n * Get text object of current range\n * @api\n * @memberOf WysiwygEditor\n * @param {Range} range Range object\n * @returns {WwTextObject}\n */\nWysiwygEditor.prototype.getTextObject = function(range) {\n    return new WwTextObject(this, range);\n};\n\nWysiwygEditor.prototype.defer = function(callback) {\n    var self = this;\n\n    setTimeout(function() {\n        if (self.isEditorValid()) {\n            callback(self);\n        }\n    }, 0);\n};\n\nWysiwygEditor.prototype.isEditorValid = function() {\n    return this.getEditor() &amp;&amp; $.contains(this.$editorContainerEl[0].ownerDocument, this.$editorContainerEl[0]);\n};\n\n/**\n * WysiwygEditor factory method\n * @api\n * @memberOf WysiwygEditor\n * @param {jQuery} $el Container element for editor\n * @param {EventManager} eventManager EventManager instance\n * @returns {WysiwygEditor} wysiwygEditor\n */\nWysiwygEditor.factory = function($el, eventManager) {\n    var wwe = new WysiwygEditor($el, eventManager);\n\n    wwe.init();\n\n    wwe.addManager(WwListManager);\n    wwe.addManager(WwTaskManager);\n    wwe.addManager(WwTableManager);\n    wwe.addManager(WwHrManager);\n    wwe.addManager(WwPManager);\n    wwe.addManager(WwHeadingManager);\n    wwe.addManager(WwCodeBlockManager);\n\n    return wwe;\n};\n\nmodule.exports = WysiwygEditor;\n</code></pre>\n        </article>\n    </section>\n\n\n\n</div>\n\n"