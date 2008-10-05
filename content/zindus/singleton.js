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
 * Portions created by Initial Developer are Copyright (C) 2007-2008
 * the Initial Developer. All Rights Reserved.
 * 
 * Contributor(s): Leni Mayo
 * 
 * ***** END LICENSE BLOCK *****/

// Handy place to keep stuff that we only ever need one of
//
function Singleton()
{
	this.m_preferences      = new MozillaPreferences();

	var loglevel            = this.get_loglevel_from_preference();
	this.m_logger_global    = new Logger(loglevel, "global");
	this.m_logger_no_prefix = new Logger(loglevel, "");
}

Singleton.instance = function()
{
	if (typeof (Singleton.m_instance) == "undefined")
		Singleton.m_instance = new Singleton();

	return Singleton.m_instance;
}

Singleton.prototype.preferences = function() { return this.m_preferences;    }

Singleton.prototype.logger = function(type)
{
	return (type && type == 'info') ? this.m_logger_no_prefix : this.m_logger_global;
}

Singleton.prototype.get_loglevel_from_preference = function()
{
	return (this.m_preferences.getCharPrefOrNull(this.m_preferences.branch(),
	                        "general." + PrefSet.GENERAL_AS_VERBOSE_LOGGING ) == "true") ? Logger.DEBUG : Logger.INFO;
}
