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

function PrefSet(prefprefix, a)
{
	this.m_id         = -1;
	this.m_prefprefix = prefprefix;
	this.m_properties = new Object();
	// this.m_logger        = newLogger("Prefset");

	for (var i in a)
		this.m_properties[a[i]] = PrefSet.DEFAULT_VALUE;
}

PrefSet.DEFAULT_VALUE            = null;

PrefSet.SERVER                   = "server";
PrefSet.SERVER_TYPE              = "type";
PrefSet.SERVER_URL               = "url";
PrefSet.SERVER_USERNAME          = "username";
PrefSet.SERVER_PROPERTIES        = [ PrefSet.SERVER_URL, PrefSet.SERVER_USERNAME, PrefSet.SERVER_TYPE ];

PrefSet.GENERAL                        = "general";
PrefSet.GENERAL_AUTO_SYNC              = "as_auto_sync";
PrefSet.GENERAL_VERBOSE_LOGGING        = "as_verbose_logging";
PrefSet.GENERAL_GD_SYNC_WITH           = "gd_sync_with";
PrefSet.GENERAL_GD_SYNC_POSTAL_ADDRESS = "gd_sync_postal_address";
PrefSet.GENERAL_ZM_SYNC_GAL_ENABLED    = "zm_sync_gal_enabled";
PrefSet.GENERAL_PROPERTIES             = [ PrefSet.GENERAL_AUTO_SYNC,             PrefSet.GENERAL_VERBOSE_LOGGING,
                                           PrefSet.GENERAL_ZM_SYNC_GAL_ENABLED,   PrefSet.GENERAL_GD_SYNC_WITH,
										   PrefSet.GENERAL_GD_SYNC_POSTAL_ADDRESS ];

PrefSet.PREAUTH                     = "preauth";
PrefSet.PREAUTH_NAME                = "name";
PrefSet.PREAUTH_REGEXP              = "regexp";
PrefSet.PREAUTH_URI_HIER_PART       = "preauth_url_hier_part";
PrefSet.PREAUTH_POST_BODY           = "preauth_post_body";
PrefSet.PREAUTH_ZM_SYNC_GAL_ENABLED = PrefSet.GENERAL_ZM_SYNC_GAL_ENABLED;
PrefSet.PREAUTH_PROPERTIES          = [ PrefSet.PREAUTH_NAME,      PrefSet.PREAUTH_REGEXP, PrefSet.PREAUTH_URI_HIER_PART, 
                                        PrefSet.PREAUTH_POST_BODY, PrefSet.PREAUTH_ZM_SYNC_GAL_ENABLED ];

// Both id and branch are optional
// id is option because there might only be a single subsection under prefprefix
// branch is optional because
// a) the collection need only create one branch object and pass it to each .load() method
// b) at some point we might like to distinguish between user-defined and default preferences,
//
PrefSet.prototype.load = function(id, branch)
{
	var i, mp, prefs;

	zinAssert((arguments.length == 0) || (arguments.length == 1) || (arguments.length == 2));

	id     = (typeof(id)     != 'undefined') ? id     : null;
	branch = (typeof(branch) != 'undefined') ? branch : Singleton.instance().preferences().branch();

	for (i in this.m_properties)
	{
		try
		{
			this.m_properties[i] = branch.getCharPref(this.makePrefKey(id, i));
		}
		catch (ex)
		{
			// do nothing
		}

		// this.m_logger.debug("load: loaded preference " + this.makePrefKey(id, i) + " == " + this.m_properties[i] + "\n");
	}

	this.m_id = id;
	
	return true;
}

PrefSet.prototype.save = function()
{
	var branch = Singleton.instance().preferences().branch();
	var i;
	var retval = false;

	zinAssert(this.m_id >= 0);

	// this.m_logger.debug("save: ");

	try
	{
		for (i in this.m_properties)
		{
			branch.setCharPref(this.makePrefKey(this.m_id, i), this.m_properties[i]);

			// this.m_logger.debug("save: preference: " + this.makePrefKey(this.m_id, i) + " == " + this.m_properties[i]);
		}

		retval = true;
	}
	catch (ex)
	{
		// do nothing
	}
	
	return retval;
}

PrefSet.prototype.remove = function()
{
	var branch = Singleton.instance().preferences().branch();
	var retval = false;

	zinAssert(this.m_id >= 0);

	try
	{
		branch.deleteBranch(this.makePrefKey(this.m_id));

		retval = true;
	}
	catch (ex)
	{
		// do nothing
	}
	
	return retval;
}

PrefSet.prototype.hasUserValue = function(property)
{
	var branch = Singleton.instance().preferences().branch();
	var ret = false;

	try
	{
		ret = branch.prefHasUserValue(this.makePrefKey(this.m_id, property));
	}
	catch (ex)
	{
		// do nothing
	}

	return ret;
}

PrefSet.prototype.toString = function()
{
	var ret = "";
	var str;

	ret += " m_id: " + this.m_id;
	ret += " m_properties: {";

	for (i in this.m_properties)
	{
		str = this.m_properties[i] == PrefSet.DEFAULT_VALUE ? "<no-pref-value>" : this.m_properties[i];
		ret += " " + i + ": \"" + str + "\"";
	}

	ret += " }";

	return ret;
}

PrefSet.prototype.isPropertyPresent = function(property)
{
	return (typeof(this.m_properties[property]) != "undefined");
}

PrefSet.prototype.getProperty = function(property)
{
	zinAssert(arguments.length == 1);
	return this.m_properties[property];
}

PrefSet.prototype.setProperty = function(property, value)
{
	this.m_properties[property] = value;
}

PrefSet.prototype.getId = function()
{
	return this.m_id;
}

// Makes keys of the following form:
// with m_prefprefix == "fred"
//    id      property      key
//    --      --------      ---
//    null    not supplied  fred
//    1       not supplied  fred.1
//    1       joe           fred.1.joe
//
PrefSet.prototype.makePrefKey = function(id, property)
{
	var ret = "";

	ret += this.m_prefprefix;
	
	if (id != null)
		ret += "." + id;

	if (arguments.length == 2)
	{
		ret +=  "." + property;
	}

	return ret;
}

PrefSet.getPassword = function(prefset)
{
	var username = prefset.getProperty(PrefSet.SERVER_USERNAME);
	var url      = prefset.getProperty(PrefSet.SERVER_URL);
	var ret      = null;

	if (username != null && url != null)
	{
		var pm = new PasswordManager();
		ret = String(pm.get(url, username));
	}

	return ret;
}
