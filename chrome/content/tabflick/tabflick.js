////////////////////////////////////////////////////////////////////////////////
// Tab Flick

var TabFlick = {

	panel: null,

	prefBranch: null,

	// [MultipleTabHandler] this must be an array
	_selectedTabs: null,

	init: function() {
		this.prefBranch = Cc["@mozilla.org/preferences-service;1"].
		                  getService(Ci.nsIPrefService).
		                  getBranch("extensions.tabflick.");
		this.panel = document.getElementById("tabFlickPanel");
		gBrowser.mTabContainer.addEventListener("dragend", TabFlick._onDragEnd, true);
		if ("TabDNDObserver" in window) {
			// [TabMixPlus] Tab Mix Plus calls own |TabDNDObserver| instead of |gBrowser._onDragEnd|
			// note that |this| points to TabDNDObserver object in |TabDNDObserver.onDragEnd|
			var funcBak = func;	// #debug
			func = TabDNDObserver.onDragEnd.toSource();
			func = func.replace(
				"gBrowser.replaceTabWithWindow(draggedTab);",
				"gBrowser.mContextTab = draggedTab; TabFlick.openPanel(aEvent);"
			);
			this.assert(func != funcBak);	// #debug
			eval("TabDNDObserver.onDragEnd = " + func);
		}
		// set the button's label at startup.
		// don't do this in generatePanel method to avoid the bug that 
		// the label will be 'undefined' after toolbar customization.
		var button = document.getElementById("tabFlickPanelButton");
		button.label = document.getElementById("menu_newNavigator").label;
		// adds menuitem to tab context menu
		var menuItem = document.getElementById("context_moveTabToWindow");
		menuItem.hidden = false;
		var refItem = document.getElementById("context_openTabInWindow");
		if (refItem)
			gBrowser.mTabContainer.contextMenu.insertBefore(menuItem, refItem.nextSibling);
		else
			// [TabMixPlus]
			gBrowser.mTabContainer.contextMenu.appendChild(menuItem);
		// [MultipleTabHandler]
		if ("MultipleTabService" in window)
			window.setTimeout(this._delayedInit, 0);
	},

	// [MultipleTabHandler]
	_delayedInit: function() {
		// this fixes the problem: 
		// sometimes insertafter attribute of Tab Flick's extra menuitem has no effect 
		var parent = document.getElementById("multipletab-selection-menu");
		var oldChild = parent.firstChild;
		if (oldChild.id == "multipletab-selection-moveTabsToWindow") {
			var refChild = document.getElementById(oldChild.getAttribute("insertafter"));
			parent.insertBefore(oldChild, refChild.nextSibling);
			dump("tabflick> move menuitem position: " + oldChild.id + "\n");	// #debug
		}
		// injects to MultipleTabService.onTabbarDragEnd
		var func = MultipleTabService.onTabbarDragEnd.toSource();
		var funcBak = func;	// #debug
		// don't stop propagation when selecting all tabs and dropping them
		func = func.replace(
			"if (this.isDraggingAllTabs(draggedTab)) {aEvent.stopPropagation();}", 
			""
		);
		TabFlick.assert(func != funcBak);	// #debug
		eval("MultipleTabService.onTabbarDragEnd = " + func);
	},

	uninit: function() {
		gBrowser.mTabContainer.removeEventListener("dragend", TabFlick._onDragEnd, true);
		this.prefBranch = null;
		this.panel = null;
	},

	// the following code is derived from "dragend" handler in tabbrowser.xml
	_onDragEnd: function(event) {
		// Note: while this case is correctly handled here, this event
		// isn't dispatched when the tab is moved within the tabstrip,
		// see bug 460801.
		gBrowser.mTabContainer._finishAnimateTabMove();
		// * mozUserCancelled = the user pressed ESC to cancel the drag
		var dt = event.dataTransfer;
		if (dt.mozUserCancelled || dt.dropEffect != "none")
			return;
		// Disable detach within the browser toolbox
		var eX = event.screenX;
		var wX = window.screenX;
		// check if the drop point is horizontally within the window
		if (eX > wX && eX < (wX + window.outerWidth)) {
			let bo = this.mTabstrip.boxObject;
			// also avoid detaching if the the tab was dropped too close to
			// the tabbar (half a tab)
			let endScreenY = bo.screenY + 1.5 * bo.height;
			let eY = event.screenY;
			if (eY < endScreenY && eY > window.screenY)
				return;
		}
		var draggedTab = dt.mozGetDataAt(TAB_DROP_TYPE, 0);
		// cannot change gBrowser.mContextTab since it is readonly
		TabContextMenu.contextTab = draggedTab;
		TabFlick.openPanel(event);
		event.stopPropagation();
	},

	openPanel: function(event) {
		document.popupNode = null;
		if (event.screenX === undefined)
			// selecting menuitem opens popup after the menuitem
			this.panel.openPopup(event.target, "after_start", 0, 0, false, false);
		else
			// dropping browser tab opens popup at pointer
			this.panel.openPopupAtScreen(event.screenX, event.screenY, false);
		// [MultipleTabHandler] NOTE: dragging tabs to select -> open popup automatically -> 
		// select 'Move to Another Window...' menu, then tab selection are cleared and 
		// we cannot get selected tabs when Tab Flick popup will opens.
		if ("MultipleTabService" in window && MultipleTabService.hasSelection())
			this._selectedTabs = MultipleTabService.getSelectedTabs();
		else
			this._selectedTabs = [gBrowser.mContextTab];
	},

	////////////////////////////////////////////////////////////////////////////////
	// Panel

	generatePanel: function(event) {
		var container = document.getElementById("tabFlickPreviewContainer");
		this._getAllWindows().forEach(function(win) {
			var preview = document.createElement("hbox");
			preview.setAttribute("class", "tabflick-preview");
			if (win == window)
				preview.setAttribute("_currentwindow", "true");
			container.appendChild(preview);
			preview.init(win);
		});
		var label = document.getElementById("tabFlickPanelLabel");
		label.style.width = (container.boxObject.width - 20).toString() + "px";
		label.value = document.documentElement.getAttribute("title");
		label.setAttribute("original-value", label.value);
		var button = document.getElementById("tabFlickPanelButton");
		// [MultipleTabHandler] disable 'New Window' button if selecting all tabs
		// disable 'New Window' button if there is only one tab
		button.disabled = gBrowser.mTabs.length == this._selectedTabs.length;
	},

	destroyPanel: function(event) {
		var container = document.getElementById("tabFlickPreviewContainer");
		while (container.hasChildNodes()) {
			var preview = container.lastChild;
			preview.uninit();
			container.removeChild(preview);
		}
		// reset label width
		var label = document.getElementById("tabFlickPanelLabel");
		label.style.width = "1px";
		this._selectedTabs = null;
	},

	onPanelMouseOver: function(event) {
		var win = event.target._window;
		if (!win)
			return;
		var container = document.getElementById("tabFlickPreviewContainer");
		var label = document.getElementById("tabFlickPanelLabel");
		label.style.width = (container.boxObject.width - 20).toString() + "px";
		label.value = win.document.documentElement.getAttribute("title");
	},

	onPanelMouseOut: function(event) {
		var label = document.getElementById("tabFlickPanelLabel");
		label.value = label.getAttribute("original-value");
	},

	onPanelClick: function(event) {
		var win = event.target._window;
		if (!win)
			return;
		if (win == window) {
			this.panel.hidePopup();
			return;
		}
		this._selectedTabs.forEach(function(tab) {
			this._swapTabToWindow(tab, win, event.shiftKey);
		}, this);
		this.panel.hidePopup();
	},

	onButtonCommand: function(event) {
		if ("MultipleTabService" in window)
			// [MultipleTabHandler]
			MultipleTabService.splitWindowFromTabs(this._selectedTabs);
		else
			gBrowser.replaceTabWithWindow(this._selectedTabs[0]);
		this.panel.hidePopup();
	},

	////////////////////////////////////////////////////////////////////////////////
	// Utils

	_getAllWindows: function() {
		var ret = [];
		var winEnum = Cc["@mozilla.org/appshell/window-mediator;1"].
		              getService(Ci.nsIWindowMediator).
		              getEnumerator("navigator:browser");
		while (winEnum.hasMoreElements()) {
			var win = winEnum.getNext();
			ret.push(win);
		}
		return ret;
	},

	_getWindowBySSi: function(aSSi) {
		var winEnum = Cc["@mozilla.org/appshell/window-mediator;1"].
		              getService(Ci.nsIWindowMediator).
		              getEnumerator("navigator:browser");
		while (winEnum.hasMoreElements()) {
			var win = winEnum.getNext();
			if (win.__SSi == aSSi)
				return win;
		}
		return null;
	},

	_swapTabToWindow: function(aTab, aWindow, aInvertSelect) {
		// adds a new tab and swap the context tab to it
		var newTab = aWindow.gBrowser.addTab("about:blank");
		var newBrowser = aWindow.gBrowser.getBrowserForTab(newTab);
		newBrowser.stop();
		newBrowser.docShell;
		aWindow.gBrowser.swapBrowsersAndCloseOther(newTab, aTab);
		var select = this.prefBranch.getBoolPref("selectAfterMove");
		if (aInvertSelect)
			select = !select;
		if (select) {
			// selects the moved tab
			aWindow.focus();
			aWindow.gBrowser.selectedTab = newTab;
		}
	},

	// #debug-begin
	assert: function(aCondition) {
		if (aCondition)
			return;
		alert("Assertion failed");
	},
	// #debug-end

};


window.addEventListener("load", function() { TabFlick.init(); }, false);
window.addEventListener("unload", function() { TabFlick.uninit(); }, false);


