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

// ZidBag:
// - a_zid        an array of Zimbra account ids.
// - m_index      gives us iterator state that allows us to walk through the zimbraIds as we cycle through GetAccountInfo and Sync
// - m_properties contains properties associated with each of the zid's in the array.
//

function ZidBag()
{
	this.a_zid              = new Array();
	this.m_index            = 0;
	this.m_properties       = new Object();
	this.a_valid_properties = newObject(Account.url, 0, 'SyncToken', 0);
}

ZidBag.prototype.toString = function()
{
	var i, j, zid;
	var ret = "m_index: " + this.m_index + " a_zid: ";

	zinAssert(this.a_zid.length == aToLength(this.m_properties));

	for (i = 0; i < this.a_zid.length; i++)
	{
		zid = this.a_zid[i];

		ret += "\n " + i + ": " + strPadTo(zid, 36);

		for (j in this.m_properties[zid])
			ret += " " + j + ": " + this.get(zid, j);
	}

	return ret;
}

ZidBag.prototype.push = function(zid)
{
	zinAssertAndLog(!isPropertyPresent(this.m_properties, zid), "zid: " + zid);

	this.a_zid.push(zid);

	this.m_properties[zid] = new Object();
}

ZidBag.prototype.set = function(zid, key, value)
{
	this.assert(zid, key);

	this.m_properties[zid][key] = value;
}

ZidBag.prototype.get = function(zid, key)
{
	zinAssertAndLog(isPropertyPresent(this.m_properties[zid], key), "zid: " + zid + " key: " + key);
	this.assert(zid, key);

	return this.m_properties[zid][key];
}

ZidBag.prototype.isPresent = function(zid)
{
	return isPropertyPresent(this.m_properties,  zid);
}

ZidBag.prototype.assert = function(zid, key)
{
	zinAssertAndLog(isPropertyPresent(this.m_properties, zid), "zid: " + zid);
	zinAssertAndLog(isPropertyPresent(this.a_valid_properties, key), "zid: " + zid + " key: " + key);
}

// This method can be called three ways:
// - no arguments: shorthand for calling the method with an argument of this.m_index
// - number:       the argument is an index into the array, lookup the zid, then return the soapURL
// - string:       the argument is a zid, return the soapURL
//
ZidBag.prototype.soapUrl = function(arg)
{
	var ret;
	
	if (arguments.length  == 0)
		ret = this.soapUrl(this.m_index);
	else if (typeof(arg) == 'number')
		ret = this.soapUrl(this.a_zid[arg]);
	else if (typeof(arg) == 'string' || arg == null)
		ret = this.get(arg, Account.url);
	else
		zinAssertAndLog(false, "invalid argument: " + arg);

	return ret;
}

ZidBag.prototype.zimbraId = function(arg)
{
	var ret;

	if (arguments.length  == 0)
		ret = this.a_zid[this.m_index];
	else if (typeof(arg) == 'number')
		ret = this.a_zid[arg];
	else
		zinAssert(false);

	return ret;
}

ZidBag.prototype.isPrimaryUser = function()
{
	return this.m_index == 0;
}

