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

function BiMap(array_a, array_b)
{
	this.m_a = new Object();
	this.m_b = new Object();

	this.add(array_a, array_b);
}

BiMap.prototype.add = function(array_a, array_b)
{
	ZinUtil.assert(typeof(array_a) == 'object' && typeof(array_b) == 'object');

	ZinUtil.assert(array_a.length == array_b.length);

	for (var i = 0; i < array_a.length; i++)
	{
		ZinUtil.assert(typeof(array_a[i]) == 'string' || typeof(array_a[i]) == 'number');
		ZinUtil.assert(typeof(array_b[i]) == 'string' || typeof(array_b[i]) == 'number');
		ZinUtil.assert(!ZinUtil.isPropertyPresent(this.m_a, array_a[i]));  // no duplicates allowed in either array
		ZinUtil.assert(!ZinUtil.isPropertyPresent(this.m_b, array_b[i]));

		this.m_a[array_a[i]] = array_b[i];
		this.m_b[array_b[i]] = array_a[i];
	}
}

BiMap.prototype.delete = function(key_a, key_b)
{
	var obj, key;

	this.assertKeysValid(key_a, key_b);

	if (key_a != null)
	{
		delete this.m_b[this.m_a[key_a]];
		delete this.m_a[key_a];
	}
	else
	{
		delete this.m_a[this.m_b[key_b]];
		delete this.m_b[key_b];
	}
}

BiMap.prototype.assertKeysValid = function(key_a, key_b)
{
	var c = 0;
	c += (key_a == null) ? 0 : 1;
	c += (key_b == null) ? 0 : 1;
	ZinUtil.assertAndLog(c == 1, "key_a: " + key_a + " key_b: " + key_b + " " + this.toString()); // exactly one of the keys must be non-null
}

BiMap.prototype.getObjAndKey = function(key_a, key_b)
{
	var obj, key;

	this.assertKeysValid(key_a, key_b);

	if (key_a != null)
	{
		obj = this.m_a;
		key = key_a;
	}
	else
	{
		obj = this.m_b;
		key = key_b;
	}

	// This used to return [ obj, key ] but that prove to be not portable.
	// Some linux javascript interpreters (JavaScript-C 1.6 pre-release 1 2006-04-04) report an error with this sort of assigment:
	// [ a, b ] = blah();
	//
	return ZinUtil.newObject('obj', obj, 'key', key);
}

BiMap.prototype.lookup = function(key_a, key_b)
{
	var tmp = this.getObjAndKey(key_a, key_b);

	ZinUtil.assert(ZinUtil.isPropertyPresent(tmp.obj, tmp.key));

	return tmp.obj[tmp.key];
}

BiMap.prototype.isPresent = function(key_a, key_b)
{
	var tmp = this.getObjAndKey(key_a, key_b);

	return ZinUtil.isPropertyPresent(tmp.obj, tmp.key);
}

BiMap.prototype.toString = function()
{
	var ret = "";
	var isFirst = true;

	for (i in this.m_a)
	{
		if (isFirst)
			isFirst = false;
		else
			ret += ", ";

		ret += i + ": " + this.m_a[i];
	}

	return ret;
}
