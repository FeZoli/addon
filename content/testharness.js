include("chrome://zindus/content/feed.js");
include("chrome://zindus/content/lso.js");

function ZinTestHarness()
{
}

ZinTestHarness.prototype.run = function()
{
	this.testZinFeedCollection();
	// this.testContactConverter();
	// this.testPropertyDelete();
	// this.testLso();
}

ZinTestHarness.prototype.testZinFeedCollection = function()
{
	var cfc = new ZinFeedCollection();
	var cfi;

	cfi = new ZinFeedItem();
	cfi.set('id', 0);
	cfi.set('name1', "value1");

	cfc.set(cfi);

	var cfi2 = cfc.get(0);
	cfi2.set('fred', 1);

	cfi = new ZinFeedItem();
	cfi.set('id', 1);
	cfi.set('name2', "value2");
	cfi.set('name3', "value3");

	cfc.set(cfi);

	gLogger.debug("3233: cfc.toString() == \n" + cfc.toString());

	cfc.del(1);

	gLogger.debug("3233: cfc.toString() after del(1) == \n" + cfc.toString());
}

ZinTestHarness.prototype.testContactConverter = function()
{
	var element = new Object();

	element['email']     = "leni@barkly.moniker.net";
	element['firstName'] = "leni";

	var properties = CnsContactConverter.instance().convert(FORMAT_TB, FORMAT_ZM, element);

	gLogger.debug("3233: testContactConverter: converts:\nzimbra: " + aToString(element) + "\nto thunderbird: " + aToString(properties));
}

ZinTestHarness.prototype.testPropertyDelete = function()
{
	var x = new Object();

	x[1] = 1;
	x[2] = 2;
	x[3] = 3;
	x[4] = 4;
	x[5] = 5;

	gLogger.debug("3233: x: " + aToString(x));

	for (i in x)
	{
		gLogger.debug("3233: i: " + i);

		if (i == 3)
			delete x[i];
	}

	gLogger.debug("3233: x: " + aToString(x));
}

ZinTestHarness.prototype.testLso = function()
{
	var lso;
	// test constructor style #1
	//
	var d = new Date();
	var s = Date.UTC();
	var t = hyphenate("-", d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) + 
	        " " +
			hyphenate(":", d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());

	gLogger.debug("blah: t: " + t);

	var zfi1 = new ZinFeedItem(ZinFeedItem.TYPE_CN, ZinFeedItem.ATTR_ID, 334, ZinFeedItem.ATTR_MS, 1234, ZinFeedItem.ATTR_MD, 1168484761);
	var zfi2 = cnsCloneObject(zfi1);

	lso = new Lso(zfi1);

	var str = "-1234-1168484761-"

	cnsAssert(lso.toString() == str);

	ZinTestHarness.testLsoCompare(lso, zfi1);

	lso = new Lso(str);

	// gLogger.debug("testLso: lso == " + aToString(lso));
	// gLogger.debug("testLso: lso.toString() == " + lso.toString());

	cnsAssert(lso.toString() == str);

	ZinTestHarness.testLsoCompare(lso, zfi2);
}

ZinTestHarness.testLsoCompare = function(lso, zfi)
{
	// gLogger.debug("testLso: lso.compare(zfi) == " + lso.compare(zfi));

	cnsAssert(lso.compare(zfi) == 0);  // test compare() == 0;

	zfi.set(ZinFeedItem.ATTR_MS, 1235);
	cnsAssert(lso.compare(zfi) == 1);  // test compare() == 1;

	zfi.set(ZinFeedItem.ATTR_MS, 1234);
	zfi.set(ZinFeedItem.ATTR_MS, 1168484762);
	cnsAssert(lso.compare(zfi) == 1);  // test compare() == 1;

	zfi.set(ZinFeedItem.ATTR_MS, 1234);
	zfi.set(ZinFeedItem.ATTR_MS, 1168484761);
	zfi.set(ZinFeedItem.ATTR_DEL, 1);
	cnsAssert(lso.compare(zfi) == 1);  // test compare() == 1;

	zfi.set(ZinFeedItem.ATTR_MS, 1233);
	cnsAssert(lso.compare(zfi) == -1);  // test compare() == -1;
}
