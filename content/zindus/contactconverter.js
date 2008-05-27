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

include("chrome://zindus/content/crc32.js");
include("chrome://zindus/content/gdaddressconverter.js");

// For the Thunderbird properties, see: mozilla/mailnews/addrbook/resources/content/abCardOverlay.js
// which is a subset of the constants defined in mozilla/mailnews/addrbook/public/nsIAddrDatabase.idl
// - the .idl also includes: LastModifiedDate, ListName, ListDescription, ListTotalAddresses
//
ZinContactConverter.VARY_NONE                      = 0x01;
ZinContactConverter.VARY_INCLUDE_GD_POSTAL_ADDRESS = 0x02;

function ZinContactConverter()
{
	this.m_equivalents  = null; // an array of objects where each object is an n-tuplet of pairs of (format, contact property)
	this.m_map          = null; // a two-dimensonal associative array where [format][property] maps to index in m_equivalents
	this.m_common_to    = null; // associative array of [format1][format2] is a hash - the keys are the format1 props that map to format2
	this.m_logger       = newZinLogger("ContactConverter");
	this.m_gac          = new GdAddressConverter();
	this.m_gd_certain_keys_converted = null;
}

ZinContactConverter.prototype.setup = function(vary)
{
	zinAssert(arguments.length == 0 || (arguments.length == 1 && (typeof(arguments[0]) == 'number') && arguments[0] > 0));

	if (arguments.length == 0)
		vary = ZinContactConverter.VARY_NONE;

	var gd = function(key) { return ((vary & ZinContactConverter.VARY_INCLUDE_GD_POSTAL_ADDRESS) ? key : null); }

	this.m_vary = vary; // TODO - debugging only;

	this.m_equivalents = new Array();
	this.m_equivalents.push(newObject(FORMAT_TB, "FirstName",       FORMAT_ZM, "firstName",         FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, "LastName",        FORMAT_ZM, "lastName",          FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, "DisplayName",     FORMAT_ZM, "fullName",          FORMAT_GD, "title"));
	this.m_equivalents.push(newObject(FORMAT_TB, "NickName",        FORMAT_ZM, null,                FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, "PrimaryEmail",    FORMAT_ZM, "email",             FORMAT_GD, "PrimaryEmail"));
	this.m_equivalents.push(newObject(FORMAT_TB, "SecondEmail",     FORMAT_ZM, "email2",            FORMAT_GD, "SecondEmail"));
	this.m_equivalents.push(newObject(FORMAT_TB, "WorkPhone",       FORMAT_ZM, "workPhone",         FORMAT_GD, "phoneNumber#work"));
	this.m_equivalents.push(newObject(FORMAT_TB, "HomePhone",       FORMAT_ZM, "homePhone",         FORMAT_GD, "phoneNumber#home"));
	this.m_equivalents.push(newObject(FORMAT_TB, "FaxNumber",       FORMAT_ZM, "workFax",           FORMAT_GD, "phoneNumber#work_fax"));
	this.m_equivalents.push(newObject(FORMAT_TB, "PagerNumber",     FORMAT_ZM, "pager",             FORMAT_GD, "phoneNumber#pager"));
	this.m_equivalents.push(newObject(FORMAT_TB, "CellularNumber",  FORMAT_ZM, "mobilePhone",       FORMAT_GD, "phoneNumber#mobile"));
	this.m_equivalents.push(newObject(FORMAT_TB, "HomeAddress",     FORMAT_ZM, "homeStreet",        FORMAT_GD, gd("postalAddress#home")));
	this.m_equivalents.push(newObject(FORMAT_TB, "HomeAddress2",    FORMAT_ZM, "homeStreet",        FORMAT_GD, gd("postalAddress#home")));
	this.m_equivalents.push(newObject(FORMAT_TB, "HomeCity",        FORMAT_ZM, "homeCity",          FORMAT_GD, gd("postalAddress#home")));
	this.m_equivalents.push(newObject(FORMAT_TB, "HomeState",       FORMAT_ZM, "homeState",         FORMAT_GD, gd("postalAddress#home")));
	this.m_equivalents.push(newObject(FORMAT_TB, "HomeZipCode",     FORMAT_ZM, "homePostalCode",    FORMAT_GD, gd("postalAddress#home")));
	this.m_equivalents.push(newObject(FORMAT_TB, "HomeCountry",     FORMAT_ZM, "homeCountry",       FORMAT_GD, gd("postalAddress#home")));
	this.m_equivalents.push(newObject(FORMAT_TB, "WorkAddress",     FORMAT_ZM, "workStreet",        FORMAT_GD, gd("postalAddress#work")));
	this.m_equivalents.push(newObject(FORMAT_TB, "WorkAddress2",    FORMAT_ZM, "workStreet",        FORMAT_GD, gd("postalAddress#work")));
	this.m_equivalents.push(newObject(FORMAT_TB, "WorkCity",        FORMAT_ZM, "workCity",          FORMAT_GD, gd("postalAddress#work")));
	this.m_equivalents.push(newObject(FORMAT_TB, "WorkState",       FORMAT_ZM, "workState",         FORMAT_GD, gd("postalAddress#work")));
	this.m_equivalents.push(newObject(FORMAT_TB, "WorkZipCode",     FORMAT_ZM, "workPostalCode",    FORMAT_GD, gd("postalAddress#work")));
	this.m_equivalents.push(newObject(FORMAT_TB, "WorkCountry",     FORMAT_ZM, "workCountry",       FORMAT_GD, gd("postalAddress#work")));
	this.m_equivalents.push(newObject(FORMAT_TB, "JobTitle",        FORMAT_ZM, "jobTitle",          FORMAT_GD, "organization#orgTitle"));
	this.m_equivalents.push(newObject(FORMAT_TB, "Department",      FORMAT_ZM, "department",        FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, "Company",         FORMAT_ZM, "company",           FORMAT_GD, "organization#orgName"));
	this.m_equivalents.push(newObject(FORMAT_TB, "WebPage1",        FORMAT_ZM, "workURL",           FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, "WebPage2",        FORMAT_ZM, "homeURL",           FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, "Custom1",         FORMAT_ZM, null,                FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, "Custom2",         FORMAT_ZM, null,                FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, "Custom3",         FORMAT_ZM, null,                FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, "Custom4",         FORMAT_ZM, null,                FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, "Notes",           FORMAT_ZM, "notes",             FORMAT_GD, "content"));
	this.m_equivalents.push(newObject(FORMAT_TB, "_AimScreenName",  FORMAT_ZM, null,                FORMAT_GD, "im#AIM"));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "middleName",        FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "email3",            FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "workPhone2",        FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "assistantPhone",    FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "companyPhone",      FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "callbackPhone",     FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "homePhone2",        FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "homeFax",           FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "carPhone",          FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "otherStreet",       FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "otherCity",         FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "otherState",        FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "otherPostalCode",   FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "otherCountry",      FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "otherPhone",        FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "otherFax",          FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "otherURL",          FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "birthday",          FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "fileAs",            FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "imAddress1",        FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "imAddress2",        FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "imAddress3",        FORMAT_GD, null));

	// these fields aren't in the zimbra web UI but are supported by the zimbra server
	// these are just the ones found through experimenting with Outlook sync - there are certainly more...
	// Must consider whether there is a better way, eg: query/determine the entire list...
	//
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "namePrefix",        FORMAT_GD, null)); // eg "Mr."
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "nameSuffix",        FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "initials",          FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "email4",            FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "email5",            FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "email6",            FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "office",            FORMAT_GD, null));
	this.m_equivalents.push(newObject(FORMAT_TB, null,              FORMAT_ZM, "outlookUserField1", FORMAT_GD, null));

	// Don't generate debug messages if unable to convert these attributes...
	// eg. the <cn> elements returned by SyncGal include ldap attributes
	// Enumerating these here might be ok at first to confirm completeness but will have diminishing value after a while.
	// The trouble is that the response from the zimbra server lumps together all the attributes of a contact and provides
	// no way of distinguishing contact content from metadata so we can't be sure we're converting all attributes relevent to content.
	//
	this.m_dont_convert = new Object();
	this.m_dont_convert[FORMAT_TB] = { };
	this.m_dont_convert[FORMAT_GD] = { };
	this.m_dont_convert[FORMAT_ZM] = newObject("zimbraId",                    0,
	                                           "objectClass",                 0,
	                                           "createTimeStamp",             0,
	                                           "zimbraMailForwardingAddress", 0,
	                                           "zimbraCalResType",            0,
	                                           "modifyTimeStamp",             0);

	this.m_bimap_format = getBimapFormat();

	this.m_zm_street_field = new Object();
	this.m_zm_street_field[FORMAT_TB] = { "HomeAddress":  0, "HomeAddress2" : 0, "WorkAddress" : 0, "WorkAddress2" : 0 };
	this.m_zm_street_field[FORMAT_GD] = { };
	this.m_zm_street_field[FORMAT_ZM] = { "homeStreet" :  0, "workStreet"   : 0 };

	this.m_gd_address_field = new Object();
	this.m_gd_address_field[FORMAT_TB] = { "HomeAddress"  : 0, "WorkAddress"  : 0,
	                                       "HomeAddress2" : 0, "WorkAddress2" : 0,
	                                       "HomeCity"     : 0, "WorkCity"     : 0,
										   "HomeState"    : 0, "WorkState"    : 0,
										   "HomeZipCode"  : 0, "WorkZipCode"  : 0,
										   "HomeCountry"  : 0, "WorkCountry"  : 0 };
	this.m_gd_address_field[FORMAT_GD] = { "postalAddress#home" :  0, "postalAddress#work" : 0 };
	this.m_gd_address_field[FORMAT_ZM] = { };

	var i, j, k;
	this.m_map = new Object();

	// this.m_logger.debug("m_equivalents: " + aToString(this.m_equivalents));

	for (j = 0; j < A_VALID_FORMATS.length;  j++)
		this.m_map[A_VALID_FORMATS[j]] = new Object();

	for (i = 0; i < this.m_equivalents.length; i++)
		for (j = 0; j < A_VALID_FORMATS.length; j++)
		{
			k = this.m_equivalents[i][A_VALID_FORMATS[j]];

			if (k != null)
				this.m_map[A_VALID_FORMATS[j]][k] = i;
		}

	// So (for example)...
	// m_map[FORMAT_TB][PrimaryEmail] == 4
	// m_map[FORMAT_ZM][email] == 4
	// m_equivalents[4][FORMAT_TB] = "PrimaryEmail";

	this.m_common_to = new Object();

	for (j = 0; j < A_VALID_FORMATS.length;  j++)
		if (A_VALID_FORMATS[j] != FORMAT_TB)
			{
				this.initialise_common_to(FORMAT_TB, A_VALID_FORMATS[j]);
				this.initialise_common_to(A_VALID_FORMATS[j], FORMAT_TB);
			}

	if (false)
	for (i in this.m_common_to)
		for (j in this.m_common_to[i])
			this.m_logger.debug("m_common_to: [" + this.m_bimap_format.lookup(i, null) +
			                                "][" + this.m_bimap_format.lookup(j, null) + "]: " + aToString(this.m_common_to[i][j]));
}

ZinContactConverter.prototype.convert = function(format_to, format_from, properties_from)
{
	var key_from, index_to, key_to;
	var a_zm_normalised_street = newObject("home", new Array(),  "work", new Array());
	var a_gd_address_fields    = newObject("home", new Object(), "work", new Object());

	zinAssert(isValidFormat(format_to) && isValidFormat(format_from));

	var properties_to = new Object();

	for (key_from in properties_from)
	{
		if (isPropertyPresent(this.m_dont_convert[format_from], key_from))
			; // do nothing
		else if (format_to == format_from)
			properties_to[key_from] = properties_from[key_from];
		else
		{
			index_to = this.m_map[format_from][key_from];

			if (typeof(index_to) != 'undefined')
			{
				key_to = this.m_equivalents[index_to][format_to];

				// this.m_logger.debug("vary: " + this.m_vary + " format_from: " + format_from + " format_to: " + format_to + " key_from: " + key_from + " key_to: " + key_to);

				if (key_to != null)
				{
					if (isPropertyPresent(this.m_zm_street_field[format_from], key_from) &&
					    isPropertyPresent(this.m_zm_street_field[format_to],   key_to))
						this.normaliseStreetLine(format_to, format_from, properties_from, key_from, a_zm_normalised_street);
					else if (isPropertyPresent(this.m_gd_address_field[format_from], key_from) &&
					         isPropertyPresent(this.m_gd_address_field[format_to],   key_to))
						this.gdAddressInput(format_to, format_from, properties_from, key_from, a_gd_address_fields);
					else
						properties_to[key_to] = properties_from[key_from];
				}
			}
			else if (!(format_from == FORMAT_GD && isPropertyPresent(this.m_gd_address_field[format_from], key_from)))
				this.m_logger.warn("Ignoring contact field that we don't have a mapping for: " +
				                       "from: " + this.m_bimap_format.lookup(format_from, null) + " " +
				                       "field: "  + key_from);
		}
	}

	if (a_zm_normalised_street["home"].length > 0 || a_zm_normalised_street["work"].length > 0)
		this.outputNormalisedStreetLine(format_to, properties_to, a_zm_normalised_street);

	for (var key in { "Home" : 0, "Work" : 0 })
		if (aToLength(a_gd_address_fields[key.toLowerCase()]) > 0)
			if (format_to == FORMAT_TB)
				this.addSuffix(key, properties_to, a_gd_address_fields[key.toLowerCase()])
			else if (format_to == FORMAT_GD)
				this.m_gac.convert(properties_to, "postalAddress#" + key.toLowerCase(), a_gd_address_fields[key.toLowerCase()],
				                     GdAddressConverter.ADDR_TO_XML );

	if (format_to == FORMAT_GD)
		GdContact.transformProperties(properties_to);
		
	// this.m_logger.debug("convert:" + " format_to: " + format_to + " format_from: " + format_from + 
	//                                  " properties_from: "       + aToString(properties_from) +
	//                                  " returns properties_to: " + aToString(properties_to));

	return properties_to;
}

// Here's what the address line conversion stuff does:
// Thunderbird field                       Zimbra field
// =================                       ============
// HomeAddress                       <==>  homeStreet line 1
// HomeAddress2 comma-separated      <==>  homeStreet lines 2 onwards
// eg.
// HomeAddress:  Unit 1, 123 Acme st       homeStreet: Unit 1, 123 Acme st
// HomeAddress2: Melbourne, VIC, 3000                  Melbourne
//                                                     VIC
//                                                     3000

ZinContactConverter.prototype.outputNormalisedStreetLine = function(format_to, properties_to, a_normalised_street)
{
	switch(format_to)
	{
		case FORMAT_TB:
			if (a_normalised_street["home"].length > 0)
				properties_to["HomeAddress"]  = a_normalised_street["home"][0];

			if (a_normalised_street["home"].length > 1)
				properties_to["HomeAddress2"] = this.arrayToSeparatedString(a_normalised_street["home"], ",", 1);

			if (a_normalised_street["work"].length > 0)
				properties_to["WorkAddress"]  = a_normalised_street["work"][0];

			if (a_normalised_street["work"].length > 1)
				properties_to["WorkAddress2"] = this.arrayToSeparatedString(a_normalised_street["work"], ",", 1);
			break;

		case FORMAT_ZM:
			if (a_normalised_street["home"].length > 0)
				properties_to["homeStreet"] = this.arrayToSeparatedString(a_normalised_street["home"], "\n", 0);

			if (a_normalised_street["work"].length > 0)
				properties_to["workStreet"] = this.arrayToSeparatedString(a_normalised_street["work"], "\n", 0);
			break;
		default: zinAssert(false);
	}
}

ZinContactConverter.prototype.arrayToSeparatedString = function(a, separator, startAt)
{
	var ret = "";

	zinAssert(startAt < a.length);

	for (var i = startAt; i < a.length; i++)
	{
		if (i != startAt)
			ret += separator;

		ret += a[i];
	}

	return ret;
}

ZinContactConverter.prototype.normaliseStreetLine = function(format_to, format_from, properties_from, key_from, a_normalised_street)
{
	var i;

	// this.m_logger.debug("normaliseStreetLine: blah: format_to: " + format_to +" format_from: " +format_from + " key_from: " + key_from);

	switch(format_from)
	{
		case FORMAT_TB: switch(key_from) {
				case "HomeAddress":  a_normalised_street["home"][0] = properties_from[key_from];                             break;
				case "WorkAddress":  a_normalised_street["work"][0] = properties_from[key_from];                             break;
				case "HomeAddress2": this.lineTwoFromCommaSeparated(properties_from, key_from, a_normalised_street, "home"); break;
				case "WorkAddress2": this.lineTwoFromCommaSeparated(properties_from, key_from, a_normalised_street, "work"); break;
				default: zinAssert(false);
			}
			break;

		case FORMAT_ZM: switch(key_from) {
				case "homeStreet": this.lineFromNewlineSeparated(properties_from, key_from, a_normalised_street, "home"); break;
				case "workStreet": this.lineFromNewlineSeparated(properties_from, key_from, a_normalised_street, "work"); break;
				default: zinAssert(false);
			}
			break;
		default: zinAssert(false);
	}

	// this.m_logger.debug("normaliseStreetLine: a_normalised_street[home]: " + a_normalised_street["home"].toString());
	// this.m_logger.debug("normaliseStreetLine: a_normalised_street[work]: " + a_normalised_street["work"].toString());
}

ZinContactConverter.prototype.lineTwoFromCommaSeparated = function(properties_from, key_from, a_line, type)
{
	var a = properties_from[key_from].split(",");

	// this.m_logger.debug("lineTwoFromCommaSeparated: type: " + type + " a: " + a.toString());

	for (var i = 0; i < a.length; i++)
		a_line[type][i + 1] = a[i];
}

ZinContactConverter.prototype.lineFromNewlineSeparated = function(properties_from, key_from, a_line, type)
{
	var a = properties_from[key_from].split("\n");

	// this.m_logger.debug("lineFromNewlineSeparated: type: " + type + " a: " + a.toString());

	for (var i = 0; i < a.length; i++)
	{
		if (i == 0)
			a_line[type][i] = a[i];
		else
			a_line[type][i] = a[i].replace(/,/, " "); // can't allow commas in line 2 and onwards
	}
}

ZinContactConverter.prototype.isKeyConverted = function(format_to, format_from, key)
{
	zinAssert(isValidFormat(format_to) && isValidFormat(format_from));

	var index_to = this.m_map[format_from][key];

	return typeof(index_to) != 'undefined' && this.m_equivalents[index_to][format_to] != null;
}

// We have to normalise the order in which we iterate through the properties so that two hashes with the same
// keys result in the same crc.  We can't just iterate through the hash with for..in because that doesn't guarantee ordering
// - the keys might not have been added to the hash in the same order.
// We avoid a sort by relying on the fact that the keys are thunderbird contact properties.
// The index into the Converter's table guarantees the ordering.
//
ZinContactConverter.prototype.crc32 = function(properties)
{
	var ret = 0;
	var str = "";
	var aSorted = new Array();

	for (var i in properties)
		if (properties[i].length > 0)
		{
			index_to = this.m_map[FORMAT_TB][i];

			if (typeof(index_to) != 'undefined')
				aSorted[index_to] = true;
			else
				zinAssertAndLog(false, "properties: " + aToString(properties) + " i: " + i);

		}

	var context = this;

	function callback_concat_str(element, index, array) {
		var key = context.m_equivalents[index][FORMAT_TB];
		str += key + ":" + properties[key];
	}

	// after this, str == FirstName:FredLastName:BloggsDisplayName:Fred BloggsPrimaryEmail:fred.bloggs@example.com
	//
	aSorted.forEach(callback_concat_str);

	ret = crc32(str);

	// this.m_logger.debug("crc32: blah: returns: " + ret + " properties: " + aToString(properties));

	return ret;
}

ZinContactConverter.prototype.removeKeysNotCommonToAllFormats = function(format_from, properties)
{
	var keys_to_remove = new Object();
	var i, j, is_converted;

	for (i in properties)
	{
		is_converted = true;

		for (j = 0; j < A_VALID_FORMATS.length;  j++)
			if (format_from != A_VALID_FORMATS[j])
				if (!this.isKeyConverted(A_VALID_FORMATS[j], format_from, i))
				{
					is_converted = false;
					break;
				}

		if (!is_converted)
			keys_to_remove[i] = true;
	}

	for (i in keys_to_remove)
		delete properties[i];

	// this.m_logger.debug("removeKeysNotCommonToAllFormats: blah: keys_to_remove: " + aToString(keys_to_remove) +
	//                     " leaving keys: " + keysToString(properties));
}

// So for example:
//	this.m_common_to[FORMAT_TB][FORMAT_GD] = PrimaryEmail : true, SecondEmail : true, WorkPhone : true, ...
//	this.m_common_to[FORMAT_GD][FORMAT_TB] = PrimaryEmail : true, SecondEmail : true, phoneNumber#work : true, ...
//
ZinContactConverter.prototype.initialise_common_to = function(format_to, format_from)
{
	if (typeof this.m_common_to[format_to] != 'object')
		this.m_common_to[format_to] = new Object();

	if (typeof this.m_common_to[format_to][format_from] != 'object')
		this.m_common_to[format_to][format_from] = new Object();

	for (i = 0; i < this.m_equivalents.length; i++)
		if (this.m_equivalents[i][format_from] != null && this.m_equivalents[i][format_to] != null)
			this.m_common_to[format_to][format_from][this.m_equivalents[i][format_to]] = true;
}

ZinContactConverter.prototype.normaliseStreetLine = function(format_to, format_from, properties_from, key_from, a_normalised_street)
{
	// this.m_logger.debug("normaliseStreetLine: blah: format_to: " + format_to +" format_from: " +format_from + " key_from: " + key_from);

	switch(format_from)
	{
		case FORMAT_TB: switch(key_from) {
				case "HomeAddress":  a_normalised_street["home"][0] = properties_from[key_from];                             break;
				case "WorkAddress":  a_normalised_street["work"][0] = properties_from[key_from];                             break;
				case "HomeAddress2": this.lineTwoFromCommaSeparated(properties_from, key_from, a_normalised_street, "home"); break;
				case "WorkAddress2": this.lineTwoFromCommaSeparated(properties_from, key_from, a_normalised_street, "work"); break;
				default: zinAssert(false);
			}
			break;

		case FORMAT_ZM: switch(key_from) {
				case "homeStreet": this.lineFromNewlineSeparated(properties_from, key_from, a_normalised_street, "home"); break;
				case "workStreet": this.lineFromNewlineSeparated(properties_from, key_from, a_normalised_street, "work"); break;
				default: zinAssert(false);
			}
			break;
		default: zinAssert(false);
	}

	// this.m_logger.debug("normaliseStreetLine: a_normalised_street[home]: " + a_normalised_street["home"].toString());
	// this.m_logger.debug("normaliseStreetLine: a_normalised_street[work]: " + a_normalised_street["work"].toString());
}

ZinContactConverter.prototype.gdAddressInput = function(format_to, format_from, properties_from, key_from, a_gd_address_fields)
{
	var left, right;

	// this.m_logger.debug("gdAddressInput: blah: format_to: " + format_to + " format_from: " + format_from + " key_from: " + key_from);

	switch(format_from)
	{
		case FORMAT_TB:
			// 4 is the length of Home and Work, so left == "Home" or "Work" and right == "Address" or "City" etc
			// if/when the set of thunderbird fields expands, we'll have to use some regexp matching here, meantime this is adequate
			//
			left  = key_from.substring(0, 4).toLowerCase();
			right = key_from.substring(4);

			a_gd_address_fields[left][right] = properties_from[key_from];
			break;

		case FORMAT_GD:
			left = zinRightOfChar(key_from); // "home" or "work"
			this.m_gac.convert(properties_from, key_from, a_gd_address_fields[left], GdAddressConverter.ADDR_TO_PROPERTIES );
			break;
		default: zinAssert(false);
	}
}

ZinContactConverter.prototype.addSuffix = function(prefix, properties_to, properties_from)
{
	for (var i in properties_from)
		if (isPropertyPresent(this.m_common_to[FORMAT_TB][FORMAT_GD], prefix + i))
			properties_to[prefix + i] = properties_from[i];
		else
			; // do nothing instead of properties_to[i] = properties_from[i]; // this is for <otheraddr>
}

ZinContactConverter.prototype.keysCommonToThatMatch = function(regexp, replace_with, format_from, format_to)
{
	var ret = new Object();
	zinAssert(arguments.length == 4);

	for (key in this.m_common_to[format_from][format_to])
		if (key.match(regexp))
			ret[key.replace(regexp, replace_with)] = true;

	if (false)
	this.m_logger.debug("keysCommonToThatMatch: " + regexp + " : " + replace_with + 
	                    " from: " + this.m_bimap_format.lookup(format_from, null) +
	                    " to: "   + this.m_bimap_format.lookup(format_to, null) +
						" returns: " + keysToString(ret));
	return ret;
}

// This is a saved search of the conversions table...
// m_converted["phoneNumber"]   == { home: null, work: null, work_fax: null, ... }
// m_converted["postalAddress"] == { home: null, ... }
//
ZinContactConverter.prototype.gd_certain_keys_converted = function()
{
	if (!this.m_gd_certain_keys_converted)
		this.m_gd_certain_keys_converted = newObject(
			"phoneNumber"  , this.keysCommonToThatMatch(/^phoneNumber#(.*)/,    "$1", FORMAT_GD, FORMAT_TB),
			"postalAddress", this.keysCommonToThatMatch(/^(postalAddress#.*$)/, "$1", FORMAT_GD, FORMAT_TB));

	return this.m_gd_certain_keys_converted;
}
