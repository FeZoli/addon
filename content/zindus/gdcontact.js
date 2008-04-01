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
 * Portions created by Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 * 
 * Contributor(s): Leni Mayo
 * 
 * ***** END LICENSE BLOCK *****/

function GdContact()
{
	this.m_document = null;
	this.m_entry    = null;
	this.m_meta     = null;
	this.m_contact  = null;

	this.m_phone_keys = { home: null,  work: null, work_fax: null, pager: null, mobile: null };
	this.m_ns_gd_length = this.ns_gd("").length;

	this.m_entry_children = null; // key ==> localName, value is the node - populated by runFunctor and fieldAdd() - saves searching
}

GdContact.prototype.toString = function()
{
	var key;
	var msg = "\n";

	for (key in this.m_meta)
		msg += " meta:    " + key + ": " + this.m_meta[key] + "\n";
	for (key in this.m_contact)
		msg += " contact: " + key + ": " + this.m_contact[key] + "\n";

	msg += xmlDocumentToString(this.m_entry);

	return msg;
}

GdContact.prototype.updateFromEntry = function(doc, node)
{
	var context = this;

	this.m_document = doc;
	this.m_entry    = node; // .cloneNode(true);
	this.m_meta     = new Object();
	this.m_contact  = new Object();

	var functor = {
		run: function(node, key)
		{
			switch(key)
			{
				case "id":
				case "updated":
					context.setProperty(node, null, context.m_meta, key);
					break;
				case "edit":
					context.setProperty(node, "href", context.m_meta, "edit");
					break;
				case "title":
				case "content":
				case "organization#orgName":
				case "organization#orgTitle":
				case "phoneNumber#work":
				case "phoneNumber#home":
				case "phoneNumber#work_fax":
				case "phoneNumber#pager":
				case "phoneNumber#mobile":
					context.setProperty(node, null,  context.m_contact, key);
					break;
				case "PrimaryEmail":
				case "SecondEmail":
				case "im#AIM":
					context.setProperty(node, "address", context.m_contact, key);
					break;
					break;
				case "deleted":
					context.m_meta["deleted"] = "true";
					break;
			}
		}
	};

	this.runFunctorOnEntry(functor);
}

GdContact.prototype.set_visited = function(a_visited, key)
{
	if (!isPropertyPresent(a_visited, key))
		a_visited[key] = true;
	else
		gLogger.error("GdContact: visited this node twice - this shouldn't happen: key: " + key +
		                                                                   " a_visited: " + aToString(a_visited)); 
}

GdContact.prototype.runFunctorOnEntry = function(functor)
{
	var i, key, child;

	var a_visited = new Object();

	this.m_entry_children = new Object();

	zinAssert(this.m_entry.nodeType == Node.ELEMENT_NODE);

	if (this.m_entry.hasChildNodes())
	{
		var children = this.m_entry.childNodes;

		for (i = 0; i < children.length; i++)
			if (children[i].nodeType == Node.ELEMENT_NODE)
			{
				child = children[i];
				key = child.localName;
				is_run_functor = false;

				// gLogger.debug("GdContact: runFunctorOnEntry: i: " + i + ": " + this.nodeAsString(child));

				if (child.namespaceURI == ZinXpath.nsResolver("atom"))
					switch(child.localName)
					{
						case "id":
						case "updated":
						case "title":
						case "content":
							this.set_visited(a_visited, key);
							functor.run(child, key);
							break;
						case "link":
							if (child.getAttribute("rel") == "edit")
							{
								key = "edit";
								this.set_visited(a_visited, key);
								functor.run(child, key);
							}
							break;
					}
				
				if (child.namespaceURI == ZinXpath.nsResolver("gd"))
					switch(child.localName)
					{
						case "organization":
							if (!isPropertyPresent(a_visited, key) && child.getAttribute("rel") == this.ns_gd("work")
							                                                       && child.hasChildNodes() )
							{
								this.m_entry_children[child.localName] = child;

								var grandchildren = child.childNodes;
								gLogger.debug("GdContact: runFunctorOnEntry: organization: grandchildren.length: " + grandchildren.length);
								for (var j = 0; j < grandchildren.length; j++)
									if (grandchildren[j].nodeType == Node.ELEMENT_NODE &&
									    grandchildren[j].namespaceURI == ZinXpath.nsResolver("gd"))
										switch(grandchildren[j].localName)
										{
											case "orgName":
											case "orgTitle":
												key = "organization#" + grandchildren[j].localName;
												gLogger.debug("GdContact: runFunctorOnEntry: organization: key: " + key);

												if (!isPropertyPresent(a_visited, key))
												{
													gLogger.debug("GdContact: runFunctorOnEntry: organization: running functor on key: " + key);
													this.set_visited(a_visited, key);
													functor.run(grandchildren[j], key);
												}
												break;
										}
							}
							break;

						case "email":
							// PrimaryEmail == the <email> element with primary="true"
							// SecondEmail  == the first <element> element without the primary=true attribute

							if (child.getAttribute("primary") == "true")
								key = "PrimaryEmail";
							else 
								key = "SecondEmail";

							if (!isPropertyPresent(a_visited, key))
							{
								this.set_visited(a_visited, key);
								functor.run(child, key);
							}
							break;

						case "phoneNumber":
							key = String(child.getAttribute("rel")).substr(this.m_ns_gd_length);

							if (isPropertyPresent(this.m_phone_keys, key))
							{
								key = "phoneNumber#" + key;

								if (!isPropertyPresent(a_visited, key))
								{
									this.set_visited(a_visited, key);
									functor.run(child, key);
								}
							}
							break;

						case "im":
							key = String(child.getAttribute("protocol")).substr(this.m_ns_gd_length);

							if (key == "AIM")
							{
								key = "im#" + key;

								if (!isPropertyPresent(a_visited, key))
								{
									this.set_visited(a_visited, key);
									functor.run(child, key);
								}
							}
							break;

						case "deleted":
							this.set_visited(a_visited, key);
							functor.run(child, key);
							break;
					}
			}
	}
}

GdContact.prototype.fieldModDel = function(node, attribute, a_field, key, a_field_used, a_to_be_deleted)
{
	gLogger.debug("GdContact: fieldModDel: key: " + key + " a_field[key]: " + a_field[key]);

	if (!isPropertyPresent(a_field, key) || a_field[key].length == 0)
	{
		var tmp = this.leftOfHash(key);
		if (isPropertyPresent(this.m_entry_children, tmp))
			parent = this.m_entry_children[tmp];
		else
			parent = this.m_entry;
		a_to_be_deleted[key] = newObject("parent", parent, "child", node);
		a_field_used[key] = true;
	}
	else
		this.setNode(node, attribute, a_field, key, a_field_used);
}

GdContact.prototype.importIntoDocument = function(doc)
{
	this.m_document = doc;
	this.m_entry = this.m_document.importNode(this.m_entry, true);
}

GdContact.prototype.updateFromContact = function(contact)
{
	var a_field         = zinCloneObject(contact);
	var a_field_used    = new Object();
	var a_to_be_deleted = new Object();
	var context = this;
	var key;

	var functor = {
		run: function(node, key)
		{
			gLogger.debug("GdContact: updateFromContact: node: " + context.nodeAsString(node));
			switch(key)
			{
				case "title":
					if (!isPropertyPresent(a_field, key))
						a_field[key] = "";
					context.setNode(node, null, a_field, key, a_field_used)
					break;
				case "content":
				case "organization#orgName":
				case "organization#orgTitle":
				case "phoneNumber#work":
				case "phoneNumber#home":
				case "phoneNumber#work_fax":
				case "phoneNumber#pager":
				case "phoneNumber#mobile":
					context.fieldModDel(node, null, a_field, key, a_field_used, a_to_be_deleted);
					break;
				case "PrimaryEmail":
				case "SecondEmail":
				case "im#AIM":
					context.fieldModDel(node, "address", a_field, key, a_field_used, a_to_be_deleted);
					break;

			}
		}
	};

	this.runFunctorOnEntry(functor);

	// now do DELs (don't do inside loop because deleting elements of an array while iterating over it produces unexpected results)
	for (key in a_to_be_deleted)
		try {
			gLogger.debug("GdContact: fieldModDel: removeChild: key: " + key + " node: " + this.nodeAsString(a_to_be_deleted[key].child));
			a_to_be_deleted[key].parent.removeChild(a_to_be_deleted[key].child);
		} catch (ex) {
			gLogger.error("key: " + key);
			zinAssertAndLog(false, "ex: " + ex + "ex.stack: " + ex.stack);
		}

	// now do ADDs...
	for (key in a_field)
		if (!isPropertyPresent(a_field_used, key))
			this.fieldAdd(key, a_field);

	if (isPropertyPresent(this.m_entry_children, "organization") && this.m_entry_children["organization"].childNodes.length == 0)
	{
		gLogger.debug("GdContact: fieldModDel: removeChild: node: " + this.nodeAsString(this.m_entry_children["organization"]));
		this.m_entry.removeChild(this.m_entry_children["organization"]);
		delete this.m_entry_children["organization"];
	}
}

GdContact.prototype.fieldAdd = function(key, a_field)
{
	var element = null;
	var parent = this.m_entry;

	switch(key)
	{
		case "title":
			gLogger.error("fieldAdd: shouldn't be here: key: " + key);
			break;
		case "content":
			element = this.m_document.createElementNS(ZinXpath.NS_ATOM, "content");
			element.setAttribute("type", "text");
			element.textContent = a_field[key];
			break;
		case "organization":
			element = this.m_document.createElementNS(ZinXpath.NS_GD, "organization");
			element.setAttribute("rel", this.ns_gd("work"));
			this.m_entry_children["organization"] = element;
			break;
		case "organization#orgName":
		case "organization#orgTitle":
			if (!isPropertyPresent(this.m_entry_children, "organization"))
				this.fieldAdd("organization");

			element = this.m_document.createElementNS(ZinXpath.NS_GD, this.rightOfHash(key));
			element.textContent = a_field[key];

			parent = this.m_entry_children["organization"];
			break;
		case "PrimaryEmail":
		case "SecondEmail":
			element = this.m_document.createElementNS(ZinXpath.NS_GD, "email");
			element.setAttribute("rel", this.ns_gd("home")); // this is pretty much a random choice
			element.setAttribute("address", a_field[key]);

			if (key == "PrimaryEmail")
				element.setAttribute("primary", "true");
				
			break;
		case "im#AIM":
			element = this.m_document.createElementNS(ZinXpath.NS_GD, "im");
			element.setAttribute("protocol", this.ns_gd("AIM"));
			element.setAttribute("rel", this.ns_gd("other")); // this is pretty much a random choice
			element.setAttribute("address", a_field[key]);
			break;
		case "phoneNumber#work":
		case "phoneNumber#home":
		case "phoneNumber#work_fax":
		case "phoneNumber#pager":
		case "phoneNumber#mobile":
			key = this.rightOfHash(key);
			element = this.m_document.createElementNS(ZinXpath.NS_GD, "phoneNumber");
			element.setAttribute("rel", this.ns_gd(key))
			element.textContent = a_field[key];
			break;
	}

	if (element)
		parent.appendChild(element);
}

GdContact.prototype.ns_gd = function(str)
{
	return ZinXpath.NS_GD + "#" + str;
}

GdContact.prototype.setProperty = function(node, attribute, collection, key)
{
	if (attribute)
		collection[key] = node.getAttribute(attribute);
	else if (node.hasChildNodes())
		collection[key] = node.firstChild.nodeValue;
	else
		collection[key] = "";
}

GdContact.prototype.setNode = function(node, attribute, collection, key, a_key_used)
{
	if (attribute)
	{
		node.setAttribute(attribute, collection[key]);
		a_key_used[key] = true;
	}
	else if (node.hasChildNodes())
	{
		node.firstChild.textContent = collection[key];
		a_key_used[key] = true;
	}
	else
		zinAssertAndLog(false, "attribute: " + attribute + " collection: " + collection.toString() + " key: " + key);
}

GdContact.prototype.leftOfHash = function(str)
{
	return str.substr(0, str.indexOf("#"));
}

GdContact.prototype.rightOfHash = function(str)
{
	return str.substr(str.indexOf("#") + 1);
}

GdContact.prototype.nodeAsString = function(node)
{
	return " nodeType: " + node.nodeType +
	       " children: " + node.hasChildNodes() +
		   " localName: " + node.localName +
		   " namespaceURI: " + node.namespaceURI +
		   " rel: " + node.getAttribute("rel");
}

function GdContactFunctorToMakeHashFromNodes()
{
	this.m_collection = new Object();
}

GdContactFunctorToMakeHashFromNodes.prototype.run = function(doc, node)
{
	var contact = new GdContact();
	
	contact.updateFromEntry(doc, node);

	this.m_collection[contact.m_meta.id] = contact;
}

GdContact.arrayFromXpath = function(doc, xpath_query)
{
	var functor = new GdContactFunctorToMakeHashFromNodes();

	ZinXpath.runFunctor(functor, xpath_query, doc);

	return functor.m_collection;
}
