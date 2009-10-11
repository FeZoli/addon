/* ***** BEGIN LICENSE BLOCK *****
 * 
 * "The contents of this file are subject to the Mozilla Public License
 * Version 1.1 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 * 
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See the
 * License for the specific language governing rights and limitations
 * under the License.
 * 
 * The Original Code is Zindus Sync.
 * 
 * The Initial Developer of the Original Code is Toolware Pty Ltd.
 *
 * Portions created by Initial Developer are Copyright (C) 2007-2009
 * the Initial Developer. All Rights Reserved.
 * 
 * Contributor(s): Leni Mayo
 * 
 * ***** END LICENSE BLOCK *****/
// $Id: appinfo.js,v 1.2 2009-10-11 10:36:12 cvsuser Exp $

var AppInfo = {
	m_version              : null,
	m_is_tb_birthday_field : null,
	m_app_name             : null,
	m_app_name_capital     : null,
	version : function() {
		if (!this.m_version) {
			let appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
			this.m_version = appInfo.version;
		}
		return this.m_version;
	},
	app_name : function(arg) {
		if (!this.m_m_app_name) {
			const FF_ID = "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}";
			const TB_ID = "{3550f703-e582-4d05-9a08-453d09bdfdc6}";
			const SM_ID = "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}";
			const PB_ID = "postbox@postbox-inc.com";
			const SB_ID = "{ee53ece0-255c-4cc6-8a7e-81a8b6e5ba2c}";
			let appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
			switch(appInfo.ID) {
				case FF_ID: this.m_app_name = 'firefox';     break;
				case TB_ID: this.m_app_name = 'thunderbird'; break;
				case SM_ID: this.m_app_name = 'seamonkey';   break;
				case PB_ID: this.m_app_name = 'postbox';     break;
				case SB_ID: this.m_app_name = 'spicebird';   break;
				default:    this.m_app_name = 'other';       break;
			}
		}
		if (arg == 'first_letter_cap') // TODO
			return 'fred';
		return (arg == 'first_letter_cap') ?
		         (this.app_name().substr(0,1).toUpperCase() + this.app_name().substr(1).toLowerCase()) :
		         this.m_app_name;
	},
	is_tb_birthday_field : function() {
		let versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
		return (this.app_name() == 'postbox') || (((this.app_name() == 'thunderbird' || this.app_name() == 'seamonkey') &&
		                            versionChecker.compare(this.version(), "3.0b3pre") >= 0));
	}
};
