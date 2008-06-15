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
 * Portions created by Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 * 
 * Contributor(s): Leni Mayo
 * 
 * ***** END LICENSE BLOCK *****/

function GdAddressConverter()
{
	this.m_logger = newLogger("GdAddressConverter");

	this.a_element_unique = [ "city", "state", "postcode", "country", "otheraddr" ];
	this.a_suffix_unique  = [ "City", "State", "ZipCode",  "Country", "otheraddr" ];
	this.a_suffix_all     = [ "Address", "Address2" ].concat(this.a_suffix_unique);

	this.m_suffix_element_bimap = new BiMap(this.a_suffix_unique, this.a_element_unique);
}

GdAddressConverter.PRETTY_XML         = 0x04;
GdAddressConverter.ADDR_TO_XML        = 0x10;
GdAddressConverter.ADDR_TO_PROPERTIES = 0x20;

// always returns true unless ADDR_TO_PROPERTIES and the string couldn't be parsed as xml
//
GdAddressConverter.prototype.convert = function(a_xml, key, a_fields, dirn)
{
	zinAssert(dirn && typeof(a_xml) == 'object');

	var address, value;
	var msg = "";
	var ret = true;

	if (dirn & GdAddressConverter.ADDR_TO_PROPERTIES)
	{
		var xml_as_char = a_xml[key].replace(/\<\?xml version=.*?\?\>/, ""); // bug 336551

		try {
			address = new XML(xml_as_char);
		} catch(e) {
			ret = false;
		}

		ret = typeof(address) == 'xml' && address.localName() == "address" && address.namespace() == Xpath.NS_ZINDUS_ADDRESS;

		if (ret)
		{
			var ns = Namespace(Xpath.NS_ZINDUS_ADDRESS);

			for (var i = 0; i < this.a_element_unique.length; i++)
				this.setIfNotBlankOrEmpty(a_fields,
				                          this.m_suffix_element_bimap.lookup(null, this.a_element_unique[i]),
										  address.ns::[this.a_element_unique[i]]);

			if (address.ns::street.length() > 0)
				this.setIfNotBlankOrEmpty(a_fields, "Address", address.ns::street[0]);

			if (address.ns::street.length() > 1)
				this.setIfNotBlankOrEmpty(a_fields, "Address2", address.ns::street[1]);

			msg += " a_fields: " + aToString(a_fields);
		}
		else
			msg += " failed to parse an <address> element out of: " + xml_as_char;
	}
	else // dirn & ADDR_TO_XML
	{
		address = "<address xmlns='" + Xpath.NS_ZINDUS_ADDRESS + "'>";
		var tag;

		if (!isPropertyPresent(a_fields, "Address") && isPropertyPresent(a_fields, "Address2"))
			a_fields["Address"] = "";

		var pretty_char = (dirn & GdAddressConverter.PRETTY_XML) ? " " : "";

		for (var i = 0; i < this.a_suffix_all.length; i++)
			if (isPropertyPresent(a_fields, this.a_suffix_all[i]))
			{
				tag = null

				switch (this.a_suffix_all[i])
				{
					case "Address":
					case "Address2": tag = "street";                                                       break;
					default:         tag = this.m_suffix_element_bimap.lookup(this.a_suffix_all[i], null); break;
				}

				if (tag)
					address += "\n<" + tag + ">" + pretty_char + zinTrim(a_fields[this.a_suffix_all[i]]) + pretty_char + "</"+tag+">";
			}

		address += "\n</address>";

		a_xml[key] = address;

		msg += " xml: " + a_xml[key]
	}

	// this.m_logger.debug("convert: blah:" + msg + " returns: " + ret);

	return ret;
}

GdAddressConverter.prototype.setIfNotBlankOrEmpty = function(properties, key, value)
{
	value = zinTrim(String(value));

	if (value.length > 0)
		properties[key] = value;
}
