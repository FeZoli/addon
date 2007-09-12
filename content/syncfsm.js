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
 * The Initial Developer of the Original Code is Moniker Pty Ltd.
 *
 * Portions created by Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 * 
 * Contributor(s): Leni Mayo
 * 
 * ***** END LICENSE BLOCK *****/

include("chrome://zindus/content/fsm.js");
include("chrome://zindus/content/bimap.js");
include("chrome://zindus/content/soapdocument.js");
include("chrome://zindus/content/xpath.js");
include("chrome://zindus/content/contact.js");
include("chrome://zindus/content/addressbook.js");
include("chrome://zindus/content/feed.js");
include("chrome://zindus/content/suo.js");
include("chrome://zindus/content/gcs.js");
include("chrome://zindus/content/lso.js");
include("chrome://zindus/content/mozillapreferences.js");
include("chrome://zindus/content/syncfsmexitstatus.js");
include("chrome://zindus/content/prefset.js");
include("chrome://zindus/content/passwordmanager.js");

SyncFsm.FILE_LASTSYNC = "lastsync";
SyncFsm.FILE_GID      = "gid";
SyncFsm.ABSPECIAL_GAL = "GAL";

function SyncFsm(state)
{
	this.state   = state;
	this.fsm     = new Object();
}

SyncFsm.getFsm = function(context)
{
	var fsm = new Object();

	fsm.transitions = {
		start:            { evCancel: 'final', evStart: 'stAuth',                                           evLackIntegrity: 'final' },
		stAuth:           { evCancel: 'final', evNext:  'stLoad',           evSoapRequest: 'stSoapRequest'                           },
		stLoad:           { evCancel: 'final', evNext:  'stGetAccountInfo', evSoapRequest: 'stSoapRequest', evLackIntegrity: 'final' },
		stGetAccountInfo: { evCancel: 'final', evNext:  'stGetInfo',        evSoapRequest: 'stSoapRequest'                           },
		stGetInfo:        { evCancel: 'final', evNext:  'stCheckLicense',   evSoapRequest: 'stSoapRequest'                           },
		stCheckLicense:   { evCancel: 'final', evNext:  'stSync',           evSoapRequest: 'stSoapRequest'                           },
		stSync:           { evCancel: 'final', evNext:  'stGetContact',     evSoapRequest: 'stSoapRequest'                           },
		stGetContact:     { evCancel: 'final', evNext:  'stSyncGal',        evSoapRequest: 'stSoapRequest', evRepeat: 'stGetContact' },
		stSyncGal:        { evCancel: 'final', evNext:  'stSyncGalCommit',  evSoapRequest: 'stSoapRequest'                           },
		stSyncGalCommit:  { evCancel: 'final', evNext:  'stLoadTb'                                                                   },
		stLoadTb:         { evCancel: 'final', evNext:  'stSyncPrepare'                                                              },
		stSyncPrepare:    { evCancel: 'final', evNext:  'stUpdateTb'                                                                 },
		stUpdateTb:       { evCancel: 'final', evNext:  'stUpdateZm'                                                                 },
		stUpdateZm:       { evCancel: 'final', evNext:  'stUpdateCleanup',  evSoapRequest: 'stSoapRequest', evRepeat: 'stUpdateZm'   },
		stUpdateCleanup:  { evCancel: 'final', evNext:  'stCommit',                                         evLackIntegrity: 'final' },

		stSoapRequest:    { evCancel: 'final', evNext:  'stSoapResponse'                                                             },
		stSoapResponse:   { evCancel: 'final', evNext:  'final' /* evNext here is set by setupSoapCall */                            },

		stCommit:         { evCancel: 'final', evNext:  'final'                                                                      }
	};

	fsm.aActionEntry = {
		start:                  context.entryActionStart,
		stAuth:                 context.entryActionAuth,
		stLoad:                 context.entryActionLoad,
		stGetAccountInfo:       context.entryActionGetAccountInfo,
		stGetInfo:              context.entryActionGetInfo,
		stCheckLicense:         context.entryActionCheckLicense,
		stSync:                 context.entryActionSync,
		stGetContact:           context.entryActionGetContact,
		stSyncGal:              context.entryActionSyncGal,
		stSyncGalCommit:        context.entryActionSyncGalCommit,
		stLoadTb:               context.entryActionLoadTb,
		stSyncPrepare:          context.entryActionSyncPrepare,
		stUpdateTb:             context.entryActionUpdateTb,
		stUpdateZm:             context.entryActionUpdateZm,
		stUpdateCleanup:        context.entryActionUpdateCleanup,
		stCommit:               context.entryActionCommit,

		stSoapRequest:          context.entryActionSoapRequest,
		stSoapResponse:         context.entryActionSoapResponse,

		final:                  context.entryActionFinal
	};

	fsm.aActionExit = {
		stAuth:           context.exitActionAuth,
		stGetAccountInfo: context.exitActionGetAccountInfo,
		stGetInfo:        context.exitActionGetInfo,
		stCheckLicense:   context.exitActionCheckLicense,
		stSync:           context.exitActionSync,
		stGetContact:     context.exitActionGetContact,
		stSyncGal:        context.exitActionSyncGal,
		stUpdateZm:       context.exitActionUpdateZm,
		stSoapResponse:   context.exitActionSoapResponse
	};

	return fsm;
}

SyncFsm.prototype.start = function()
{
	fsmTransitionSchedule(this.state.id_fsm, null, 'start', 'evStart', this);
}

SyncFsm.prototype.cancel = function(timeoutID)
{
	window.clearTimeout(timeoutID);

	this.state.m_logger.debug("cancel: cleared timeoutID: " + timeoutID);

	if (this.state.m_soap_state.m_callcompletion)
	{
		var ret = this.state.m_soap_state.m_callcompletion.abort();

		this.state.m_logger.debug("abort: m_callcompletion.abort() returns: " + ret);
	}

	this.state.m_soap_state.is_cancelled = true

	if (typeof this.fsm.continuation != 'function')
	{
		// the fsm hasn't had a transition yet so there's no continuation
		// so we just enter the start state and give it a cancel event
		//
		this.state.m_logger.debug("cancel: fsm was about to enter start state - now it does that on evCancel");
		fsmTransitionSchedule(this.state.id_fsm, null, 'start', 'evCancel', this);
	}
	else
	{
		this.state.m_logger.debug("cancel: continuing on evCancel");

		this.fsm.continuation('evCancel');
	}
}

SyncFsm.prototype.entryActionStart = function(state, event, continuation)
{
	var nextEvent = null;

	if (event == 'evCancel')
	{
		nextEvent = 'evCancel';
	}
	else
	{
		var url      = this.state.sources[this.state.sourceid_zm]['soapURL'];
		var username = this.state.sources[this.state.sourceid_zm]['username'];
		var password = this.state.sources[this.state.sourceid_zm]['password'];

		if (/^https?:\/\//.test(url) && username.length > 0 && password.length > 0)
		{
			this.state.soapURL = this.state.sources[this.state.sourceid_zm]['soapURL'];

			nextEvent = 'evStart';
		}
		else
			nextEvent = 'evLackIntegrity';
	}

	this.state.m_logger.debug("entryActionStart: nextEvent: " + nextEvent);

	continuation(nextEvent);
}

SyncFsm.prototype.entryActionAuth = function(state, event, continuation)
{
	this.setupSoapCall(state, 'evNext', "Auth",
	                          this.state.sources[this.state.sourceid_zm]['username'],
	                          this.state.sources[this.state.sourceid_zm]['password']);

	continuation('evSoapRequest');
}

SyncFsm.prototype.exitActionAuth = function(state, event)
{
	if (!this.state.m_soap_state.m_response || event == "evCancel")
		return;

	var response = this.state.m_soap_state.m_response;

	if (response)
	{
		conditionalGetElementByTagNameNS(response, ZimbraSoapDocument.NS_ACCOUNT, "authToken", this.state, 'authToken');
		conditionalGetElementByTagNameNS(response, ZimbraSoapDocument.NS_ACCOUNT, "lifetime",  this.state, 'lifetime');
		conditionalGetElementByTagNameNS(response, ZimbraSoapDocument.NS_ACCOUNT, "sessionId", this.state, 'sessionId');
	}
}

SyncFsm.prototype.loadZfcs = function(a_zfc)
{
	var cExist = 0;

	dump("am here 1\n");
	a_zfc[SyncFsm.FILE_GID      + ".txt"] = this.state.zfcGid      = new ZinFeedCollection();
	a_zfc[SyncFsm.FILE_LASTSYNC + ".txt"] = this.state.zfcLastSync = new ZinFeedCollection();

	dump("am here 2\n");
	for (var i in this.state.sources)
	{
		var key = hyphenate("-", i, this.state.m_bimap_format.lookup(this.state.sources[i]['format'], null)) + ".txt";
	dump("am here 3\n");
		a_zfc[key] = this.state.sources[i]['zfcLuid'] = new ZinFeedCollection();
	dump("am here 4\n");
	}

	for (var i in a_zfc)
	{
	dump("am here 5\n");
		a_zfc[i].filename(i);

		if (a_zfc[i].nsifile().exists())
			cExist++;

	dump("am here 6\n");
		a_zfc[i].load();
	}

	dump("am here 7\n");
	this.state.aReverseGid = this.getGidInReverse();

	dump("am here 8\n");
	return cExist;
}

SyncFsm.prototype.entryActionLoad = function(state, event, continuation)
{
	// Here is (one of the places) where we pay for not having a real data store.
	// Even though data is stored in at least four separate files: 1-tb.txt, 2-zm.txt, gid.txt, lastsync.txt 
	// as far as integrity is concerned they are a single unit.
	//
	// We distinguish between three cases:
	// 1. clean slate (ie post install or reset)          ==> initialise and nextEvent == evNext
	// 2. all the files exist and have integrity          ==> continue   and nextEvent == evNext
	// 3. some files don't exist or don't have integrity  ==> continue   and nextEvent == evLackIntegrity (user is notified)
	//
	var nextEvent = null;
	var cExist;

	var a_zfc = new Object(); // associative array of zfc, key is the file name

	cExist = this.loadZfcs(a_zfc);

	this.state.m_logger.debug("entryActionLoad: number of file load attempts: " + aToLength(a_zfc) +
	                                          " number of file load actual: "   + cExist);

	var sourceid_zm = this.state.sourceid_zm;

	this.state.m_logger.debug("entryActionLoad: blah: zfcLastSync soapURL: "  +
	   ( this.state.zfcLastSync.isPresent(sourceid_zm) ? this.state.zfcLastSync.get(sourceid_zm).getOrNull('soapURL') : "not present"));
	this.state.m_logger.debug("entryActionLoad: blah: zfcLastSync username: "  +
	   ( this.state.zfcLastSync.isPresent(sourceid_zm) ? this.state.zfcLastSync.get(sourceid_zm).getOrNull('username') : "not present"));
	this.state.m_logger.debug("entryActionLoad: blah: sources soapURL:  " + this.state.sources[sourceid_zm]['soapURL']);
	this.state.m_logger.debug("entryActionLoad: blah: sources username: " + this.state.sources[sourceid_zm]['username']);


	if (cExist != 0 && (this.state.zfcLastSync.get(sourceid_zm).getOrNull('soapURL')  != this.state.sources[sourceid_zm]['soapURL'] ||
	                    this.state.zfcLastSync.get(sourceid_zm).getOrNull('username') != this.state.sources[sourceid_zm]['username']))
	{
		this.state.m_logger.debug("entryActionLoad: server url or username changed since last sync - doing a reset to force slow sync");

		SyncFsm.removeZfcs();

		cExist = this.loadZfcs(a_zfc);

		this.state.m_logger.debug("entryActionLoad: blah: after remove+load, zfcGid: " + this.state.zfcGid.toString());

		// TODO - work out whether we need to get the contacts underneat Sync Issues/Conflicts etc...
	}

	if (cExist == 0)
	{
		this.state.m_logger.debug("entryActionLoad: data files didn't exist - initialising...");

		this.initialiseZfcLastSync();
		this.initialiseZfcAutoIncrement(this.state.zfcGid);
		this.initialiseZfcAutoIncrement(this.state.sources[this.state.sourceid_tb]['zfcLuid']);
		this.initialiseTbAddressbook();

		nextEvent = 'evNext';
	}
	else if (cExist == aToLength(a_zfc) && this.isConsistentDataStore())
		nextEvent = 'evNext';
	else
		nextEvent = 'evLackIntegrity';

	this.state.m_logger.debug("entryActionLoad: nextEvent: " + nextEvent);

	continuation(nextEvent);
}

// Here's what's tested:
// - thunderbird source:
//   - confirm that there are no ZinFeedItem.ATTR_DEL flags in thunderbird sources
//     (there can only be a ZinFeedItem.ATTR_DEL flag in a zimbra source if there was a network or server failure)
// - confirm that everything in a source map is in the gid - for zimbra this is qualified by isOfInterest()
// - confirm that everything in the gid is in a source map
// - confirm that no item in a map has the 'present' flag - this should have got deleted and isn't meant to be persisted
//
// Could also (but don't) test for:
// - 'l'   attributes are correct
// - 'ver' attributes make sense

SyncFsm.prototype.isSlowSync = function(sourceid)
{
	zinAssert(this.state.sources[sourceid]['format'] == FORMAT_ZM);

	return !this.state.zfcLastSync.get(sourceid).isPresent('SyncToken');
}

SyncFsm.prototype.isConsistentDataStore = function()
{
	var ret = true;

	ret = ret && this.isConsistentZfcAutoIncrement(this.state.zfcGid);
	ret = ret && this.isConsistentZfcAutoIncrement(this.state.sources[this.state.sourceid_tb]['zfcLuid']);
	ret = ret && this.isConsistentGid();
	ret = ret && this.isConsistentSources();

	return ret;
}

SyncFsm.prototype.isConsistentGid = function()
{
	var is_consistent = true;
	this.state.m_logger.debug("isConsistentGid: entering");
	
	// test that:
	// - every (sourceid, luid) in the gid present in the corresponding source (tested by reference to aReverseGid)

	bigloop:
		for (var sourceid in this.state.aReverseGid)
			for (var luid in this.state.aReverseGid[sourceid])
				if (!isPropertyPresent(this.state.sources, sourceid) || !this.state.sources[sourceid]['zfcLuid'].isPresent(luid))
				{
					this.state.m_logger.debug("isConsistentGid: inconsistency: sourceid: " + sourceid + " luid: " + luid);
					is_consistent = false;
					break bigloop;
				}

	this.state.m_logger.debug("isConsistentGid: " + is_consistent);

	return is_consistent;
}

SyncFsm.prototype.isConsistentSources = function()
{
	var sourceid;
	var is_consistent = true;

	var functor_foreach_luid = {
		state: this.state,

		run: function(zfi)
		{
			var luid = zfi.id();

			if ( (this.state.sources[sourceid]['format'] == FORMAT_TB ||
			    (this.state.sources[sourceid]['format'] == FORMAT_ZM && SyncFsm.isOfInterest(zfc, zfi.id()))) &&
				!isPropertyPresent(this.state.aReverseGid[sourceid], luid) )
				{
					this.state.m_logger.debug("isConsistentSources: inconsistency vs gid: sourceid: " + sourceid + " luid: " + luid);
					is_consistent = false;
				}

			// a zimbra source might have a ZinFeedItem.ATTR_DEL attribute because of a network or server failure
			// only test thunderbird
			//
			if (is_consistent && this.state.sources[sourceid]['format'] == FORMAT_TB && zfi.isPresent(ZinFeedItem.ATTR_DEL))
			{
				this.state.m_logger.debug("isConsistentSources: inconsistency re: ATTR_DEL: sourceid: " + sourceid + " luid: " + luid);
				is_consistent = false;
			}

			if (is_consistent && zfi.isPresent('present'))
			{
				this.state.m_logger.debug("isConsistentSources: inconsistency re: 'present': sourceid: " + sourceid + " luid: " + luid);
				is_consistent = false;
			}

			return is_consistent;
		}
	};

	for (sourceid in this.state.sources)
	{
		zfc = this.state.sources[sourceid]['zfcLuid'];
		zfc.forEach(functor_foreach_luid, SyncFsm.forEachFlavour(this.state.sources[sourceid]['format']));
	}

	this.state.m_logger.debug("isConsistentSources: " + is_consistent);

	return is_consistent;
}

SyncFsm.prototype.isConsistentZfcAutoIncrement = function(zfc)
{
	return zfc.isPresent(ZinFeedItem.ID_AUTO_INCREMENT) &&
	       zfc.get(ZinFeedItem.ID_AUTO_INCREMENT).isPresent('next') &&
		   parseInt(zfc.get(ZinFeedItem.ID_AUTO_INCREMENT).get('next')) > ZinFeedItem.ID_MAX_RESERVED;
}

SyncFsm.prototype.initialiseZfcLastSync = function()
{
	var zfc = this.state.zfcLastSync;

	for (var i in this.state.sources)
		if (this.state.sources[i]['format'] == FORMAT_ZM && !zfc.isPresent(i))
			zfc.set(new ZinFeedItem(null, ZinFeedItem.ATTR_ID, i));
}

SyncFsm.prototype.initialiseZfcAutoIncrement = function(zfc)
{
	zinAssert(zfc.length() == 0);

	zfc.set( new ZinFeedItem(null, ZinFeedItem.ATTR_ID, ZinFeedItem.ID_AUTO_INCREMENT, 'next', ZinFeedItem.ID_MAX_RESERVED + 1));
}

// remove any luid attributes in the addressbook
//
SyncFsm.prototype.initialiseTbAddressbook = function()
{
 	var functor_foreach_card = {
		run: function(uri, item)
		{
			var abCard  = item.QueryInterface(Components.interfaces.nsIAbCard);
			var mdbCard = item.QueryInterface(Components.interfaces.nsIAbMDBCard);

			var id =  mdbCard.getStringAttribute(TBCARD_ATTRIBUTE_LUID);

			if (id > 0)
				mdbCard.setStringAttribute(TBCARD_ATTRIBUTE_LUID, 0); // delete would be more natural but not supported by api

			return true;
		}
	};

	var functor_foreach_addressbook = {
		run: function(elem)
		{
			ZimbraAddressBook.forEachCard(elem.directoryProperties.URI, functor_foreach_card);

			return true;
		}
	};

	ZimbraAddressBook.forEachAddressBook(functor_foreach_addressbook);
}

// build a two dimensional associative array for reverse lookups - meaning given a sourceid and luid, find the gid.
// For example: reverse.1.4 == 7 means that sourceid == 1, luid == 4, gid == 7
// forward lookups are done via zfcGid: zfcGid.get(7).get(1) == 4
//
SyncFsm.prototype.getGidInReverse = function()
{
	var reverse = new Object();

	for (sourceid in this.state.sources)
		reverse[sourceid] = new Object();

	var functor_each_gid_mapitem = {
		state: this.state,

		run: function(sourceid, luid)
		{
			reverse[sourceid][luid] = this.gid;

			return true;
		}
	};

	var functor_foreach_gid = {
		run: function(zfi)
		{
			var gid = zfi.id();

			functor_each_gid_mapitem.gid = gid;
			zfi.forEach(functor_each_gid_mapitem, ZinFeedItem.ITER_SOURCEID);

			return true;
		}
	};

	this.state.zfcGid.forEach(functor_foreach_gid, ZinFeedCollection.ITER_UNRESERVED);

	this.state.m_logger.debug("1177 - getGidInReverse returns: " + aToString(reverse));

	return reverse;
}

SyncFsm.prototype.entryActionGetAccountInfo = function(state, event, continuation)
{
	this.setupSoapCall(state, 'evNext', "GetAccountInfo", this.state.sources[this.state.sourceid_zm]['username']);

	continuation('evSoapRequest');
}

SyncFsm.prototype.entryActionGetInfo = function(state, event, continuation)
{
	this.setupSoapCall(state, 'evNext', "GetInfo");

	continuation('evSoapRequest');
}

SyncFsm.prototype.exitActionGetInfo = function(state, event)
{
	if (!this.state.m_soap_state.m_response || event == "evCancel")
		return;

	var xpath_query = "/soap:Envelope/soap:Body/za:GetInfoResponse/za:attrs/za:attr[@name='zimbraFeatureGalEnabled']";
	var functor     = new FunctorArrayOfTextNodeValue();

	ZinXpath.runFunctor(functor, xpath_query, this.state.m_soap_state.m_response);

	if (functor.a.length == 1)
	{
		var re = /TRUE/i;

		this.state.isZimbraFeatureGalEnabled = re.test(functor.a[0]);

		this.state.m_logger.debug("exitActionGetInfo: isZimbraFeatureGalEnabled: " + this.state.isZimbraFeatureGalEnabled);
	}
	else
		this.state.m_logger.warn("expected <attr name='zimbraFeatureGalEnabled'>xxx</attr> in <GetInfoResponse> - default: " +
		                          (this.state.isZimbraFeatureGalEnabled ? "" : "don't") + " sync GAL");
}

SyncFsm.prototype.exitActionGetAccountInfo = function(state, event)
{
	if (!this.state.m_soap_state.m_response || event == "evCancel")
		return;

	var soapURL     = null;
	var xpath_query = "/soap:Envelope/soap:Body/za:GetAccountInfoResponse/za:soapURL";
	var functor     = new FunctorArrayOfTextNodeValue();

	ZinXpath.runFunctor(functor, xpath_query, this.state.m_soap_state.m_response);

	if (functor.a.length == 1)
		soapURL = functor.a[0];
	else if (functor.a.length > 1)
	{
		var scheme = this.state.m_preferences.getCharPref(this.state.m_preferences.branch(), "system.preferSchemeForSoapUrl");
		var scheme_length = scheme.length;

		for (var i = 0; i < functor.a.length && (soapURL == null); i++)
			if (functor.a[i].substr(0, scheme_length) == scheme)
				soapURL = functor.a[i];

		if (!soapURL)
			this.state.m_logger.warn("Unexpected soap response - multiple soapURL's returned and none are https");
	}

	if (soapURL)
		this.state.soapURL = soapURL;

	// this.state.m_logger.debug("exitActionGetAccountInfo: soapURL: " + soapURL + " this.state.soapURL == " + this.state.soapURL);
}

SyncFsm.prototype.entryActionCheckLicense = function(state, event, continuation)
{
	this.setupSoapCall(state, 'evNext', "CheckLicense");

	continuation('evSoapRequest');
}

SyncFsm.prototype.exitActionCheckLicense = function(state, event)
{
	if (event == "evCancel")
		return;

	if (this.state.m_soap_state.m_fault_element_xml && this.state.m_soap_state.m_faultcode == "service.UNKNOWN_DOCUMENT")
		this.state.mapiStatus = "CheckLicense not supported by server - probably open source edition";
	else if (this.state.m_soap_state.m_response)
	{
		var xpath_query = "/soap:Envelope/soap:Body/za:CheckLicenseResponse/attribute::status";
		var warn_msg    = "warning - expected to find 'status' attribute in <CheckLicenseResponse>";

		ZinXpath.setConditional(this.state, 'mapiStatus', xpath_query, this.state.m_soap_state.m_response, warn_msg);
	}
}

SyncFsm.prototype.entryActionSync = function(state, event, continuation)
{
	var syncToken = this.state.zfcLastSync.get(this.state.sourceid_zm).getOrNull('SyncToken');

	// slow sync <==> no "last sync token"
	zinAssert((!syncToken && this.isSlowSync(this.state.sourceid_zm)) || (syncToken && !this.isSlowSync(this.state.sourceid_zm)));

	this.setupSoapCall(state, 'evNext', "Sync", syncToken);

	continuation('evSoapRequest');
}

SyncFsm.prototype.exitActionSync = function(state, event)
{
	if (!this.state.m_soap_state.m_response || event == "evCancel")
		return;

	var response  = this.state.m_soap_state.m_response;
	var sourceid = this.state.sourceid_zm;
	var zfcServer = this.state.sources[sourceid]['zfcLuid'];
	var id, functor, xpath_query;

	ZinXpath.setConditional(this.state, 'SyncMd',    "/soap:Envelope/soap:Body/zm:SyncResponse/attribute::md",    response, null);
	ZinXpath.setConditional(this.state, 'SyncToken', "/soap:Envelope/soap:Body/zm:SyncResponse/attribute::token", response, null);

	// TODO - what if the sync token went backwards (eg if the server had to restore from backups) ??

	// Things we're expecting:
	// <folder view="contact" ms="2713" md="1169690090" l="1" name="address-book-3" id="563"><acl/></folder>
	// <cn ids="567,480,501"/>
	// <cn d="1169685098000" ms="2708" md="1169685098" email="a.b@example.com" fileAsStr="a b" l="7" id="561" rev="2708"/>
	// <deleted ids="561"/>
	//   ==> set the ZinFeedItem.ATTR_DEL flag in the map
	//
	
	// <folder view="contact" ms="2713" md="1169690090" l="1" name="address-book-3" id="563"><acl/></folder>
	//  ==> add the id to the map
	//
	var xpath_query_folders = "/soap:Envelope/soap:Body/zm:SyncResponse//zm:folder[@view='contact' or @id='" + ZIMBRA_ID_TRASH + "']";
	xpath_query = xpath_query_folders;

	functor = {
		state: this.state,
		run: function(doc, node)
		{
			var attribute = attributesFromNode(node);
			var id = attribute['id'];
			var l  = attribute['l'];
			var msg = "111113 - found a <folder id='" + id +"' l='" + l + "'>";

			if (!isPropertyPresent(attribute, 'id') || !isPropertyPresent(attribute, 'l'))
				this.state.m_logger.error("<folder> element received seems to be missing an 'id' or 'l' attribute - ignoring: " + aToString(attribute));
			else
			{
				if (zfcServer.isPresent(id))
				{
					var isInterestingPreUpdate = SyncFsm.isOfInterest(zfcServer, id);

					zfcServer.get(id).set(attribute);  // update existing item

					msg += " - updated id in map";

					var isInterestingPostUpdate = SyncFsm.isOfInterest(zfcServer, id);

					if (!isInterestingPreUpdate && isInterestingPostUpdate)
					{
						// a folder has become of interest (eg it moved out of trash), we need to get it's contacts
						//
						aContactIds = ZinFeed.getContactIdsForParent(zfc, id);

						for (var i = 0; i < aContactIds.length; i++)
							this.state.aQueue[aContactIds[i]] = true;

						msg += " - folder has become of interest - adding children to queue: " + aContactIds.toString();
					}
				}
				else
				{
					zfcServer.set(new ZinFeedItem(ZinFeedItem.TYPE_FL, attribute));  // add new item
					msg += " - adding folder to map";
				}
			}
		}
	};

	ZinXpath.runFunctor(functor, xpath_query, response);

	// <cn d="1169685098000" ms="2708" md="1169685098" email="a.b@example.com" fileAsStr="a b" l="7" id="561" rev="2708"/>
	//   This element appears as a child of a <SyncResponse> element
	//
	//   if the id isn't in the map
	//           ==> add the id to the queue for GetContactRequest,
	//               in which case the id get added to the map in GetContactResponse
	//   else
	//     update the attributes in the map
	//     if the rev attribute is unchanged and the item became of interest or
	//       the rev attribute changed and it's a contact we're interested in
	//           ==> add the id to the queue for GetContactRequest,
	//               in which case the id get added to the map in GetContactResponse
	//

	xpath_query = "/soap:Envelope/soap:Body/zm:SyncResponse//zm:cn[not(@ids) and not(@type='group')]";

	functor = {
		state: this.state,

		run: function(doc, node)
		{
			var attribute = attributesFromNode(node);
			var id = attribute['id'];
			var l  = attribute['l'];
			var msg = "11113 - found a <cn id='" + id +"' l='" + l + "'>";
			
			// if the rev attribute is different from that in the map, it means a content change is pending so add the id to the queue,
			// otherwise just add it to the map
			//

			if (!isPropertyPresent(attribute, 'id') || !isPropertyPresent(attribute, 'l'))
				this.state.m_logger.error("<cn> element received from server without an 'id' or 'l' attribute.  Unexpected.  Ignoring: " + aToString(attribute));
			else
			{
				var fAddToTheQueue = false;

				if (!zfcServer.isPresent(id))
				{
					fAddToTheQueue = true;
					msg += " - first time it's been seen ";
				}
				else
				{
					var isInterestingPreUpdate = SyncFsm.isOfInterest(zfcServer, id);

					var isRevChange = !isPropertyPresent(attribute, ZinFeedItem.ATTR_REV) ||
					                  !zfcServer.get(id).isPresent(ZinFeedItem.ATTR_REV)  ||
					                  attribute[ZinFeedItem.ATTR_REV] != zfcServer.get(id).get(ZinFeedItem.ATTR_REV);

					zfcServer.get(id).set(attribute);

					msg += " - updated id in map";

					var isInterestingPostUpdate = SyncFsm.isOfInterest(zfcServer, id);

					if (!isRevChange && isInterestingPostUpdate && !isInterestingPreUpdate)
					{
						fAddToTheQueue = true;
						msg += " - rev didn't change but the id become of interest";
					}
					else if (isRevChange && isInterestingPostUpdate)
					{
						fAddToTheQueue = true;
						msg += " - rev changed and the item is of interest";
					}
				}

				if (fAddToTheQueue)
				{
					msg += " - add to the queue for GetContactRequest";
					this.state.aQueue[id] = true;
				}
			}

			this.state.m_logger.debug(msg);
		}
	};

	ZinXpath.runFunctor(functor, xpath_query, response);

	functor = {
		ids: new Object(),

		run: function(doc, node)
		{
			zinAssert(node.nodeType == Node.ATTRIBUTE_NODE);
			
			var ids = node.nodeValue;

			for each (var id in ids.split(","))
				this.ids[id] = true;
		}
	};

	// <cn ids="567,480,501"/>
	//   This element appears as a child of a <folder> element
	//     ==> add each id to the queue for GetContactRequest
	//     ==> the id is added to the map in GetContactResponse
	//
	// xpath_query = "/soap:Envelope/soap:Body/zm:SyncResponse//zm:folder[@l='1' and (@view='contact' or @name='Trash')]/zm:cn/@ids";
	//
	xpath_query = xpath_query_folders + "/zm:cn/@ids";

	ZinXpath.runFunctor(functor, xpath_query, response);

	for (id in functor.ids)
		this.state.aQueue[id] = true;

	// <deleted ids="561,542"/>
	//   ==> set the ZinFeedItem.ATTR_DEL flag in the map
	// Some of the deleted ids might not relate to contacts at all
	// So we may never have seen them and no map entry exists.
	// So the ZinFeedItem.ATTR_DEL flag is set only on items already in the map.
	//
	//
	xpath_query = "/soap:Envelope/soap:Body/zm:SyncResponse//zm:deleted/@ids";
	functor.ids = new Object();

	ZinXpath.runFunctor(functor, xpath_query, response);

	for (id in functor.ids)
		if (zfcServer.isPresent(id))
			zfcServer.get(id).set(ZinFeedItem.ATTR_DEL, 1);

	// At the end of all this:
	// - our map points to subset of items on the server - basically all folders with @view='contact' and their contacts
	// - this.state.aQueue is populated with the ids of:
	//   - contacts that are in the parent folders of interest, and
	//   - contacts whose content has changed (indicated by the rev attribute being bumped)

	this.state.m_logger.debug("11113 - aQueue: " + aToString(this.state.aQueue));
}

SyncFsm.prototype.entryActionGetContact = function(state, event, continuation)
{
	var nextEvent = null;

	// this.state.m_logger.debug("11116: entryActionGetContact, aQueue == " + aToString(this.state.aQueue) );

	if (this.state.SyncMd == null)
	{
		this.state.m_logger.debug("Can't proceed with sync because (for some reason) <SyncResponse> didn't have an 'md' attribute");

		nextEvent = 'evCancel';
	}
	else
	{
		var id;
		for (id in this.state.aQueue)
			break;

		if (typeof(id) != 'undefined')
		{
			this.state.m_logger.debug("11116: calling GetContactsRequest with id == " + id );

			this.setupSoapCall(state, 'evRepeat', "GetContacts", id);

			nextEvent = 'evSoapRequest';
		}
		else
		{
			this.state.m_soap_state.m_response = null;

			nextEvent = 'evNext';
		}
	}

	continuation(nextEvent);
}

SyncFsm.prototype.exitActionGetContact = function(state, event)
{
	if (!this.state.m_soap_state.m_response || event == "evCancel")
		return;

	var xpath_query = "/soap:Envelope/soap:Body/zm:GetContactsResponse/zm:cn";
	var functor     = new FunctorArrayOfContactsFromNodes(ZinXpath.nsResolver("zm")); // see <cn> above
	var zfcServer   = this.state.sources[this.state.sourceid_zm]['zfcLuid'];

	ZinXpath.runFunctor(functor, xpath_query, this.state.m_soap_state.m_response);

	// this.state.m_logger.debug("111118 - functor.a.length == " + functor.a.length);

	if (functor.a.length <= 0)
		this.state.m_logger.warn("GetContactsResponse recieved without containing a <cn> entry");
	else
	{
		for (var i = 0; i < functor.a.length; i++)
		{
			var id = functor.a[i].attribute['id'];

			// this.state.m_logger.debug("111119: i == " + i + " and id == " + id);

			if (this.state.aQueue[id])
			{
				if (functor.a[i].isMailList())
					; // zfcServer.set(new ZinFeedItem(FEED_ITEM_TYPE_DL, functor.a[i].attribute)); // ignore mailing lists (for the moment)
				else
				{
					this.state.aSyncContact[id] = functor.a[i];

					if (zfcServer.isPresent(id))
						zfcServer.get(id).set(functor.a[i].attribute);                                // update existing item
					else
						zfcServer.set(new ZinFeedItem(ZinFeedItem.TYPE_CN, functor.a[i].attribute));  // add new item

					// this.state.m_logger.debug("111119: added this.state.aSyncContact[" + id + "] == " + this.state.aSyncContact[id]);
				}

				delete this.state.aQueue[id];
			}
			else
				this.state.m_logger.warn("GetContactsResponse recieved contact id == " + id + " but it was not in our queue!  Ignored.");
		}
	}
}

SyncFsm.prototype.entryActionSyncGal = function(state, event, continuation)
{
	var nextEvent = null;

	if (!this.state.isZimbraFeatureGalEnabled)
	{
		this.state.m_soap_state.m_response = null;
		nextEvent = 'evNext';
	}
	else
	{
		var SyncGalMdInterval = parseInt(this.state.m_preferences.getIntPref(this.state.m_preferences.branch(),
		                                                                     "system.SyncGalMdInterval"));
		var SyncMd = this.state.zfcLastSync.get(this.state.sourceid_zm).getOrNull('SyncMd');

		this.state.m_logger.debug("entryActionSyncGal: SyncGalMdInterval == " + SyncGalMdInterval +
		                                             " SyncMd: " + SyncMd + " this.state.SyncMd: " + this.state.SyncMd);

		if (SyncMd == null || (this.state.SyncMd > (SyncMd + SyncGalMdInterval)))
		{
			this.state.SyncGalToken = null;

			this.state.m_logger.debug("entryActionSyncGal Gal either expired or had no state - this.state.SyncGalToken set to null to force replacement of GAL");

			// When this.state.SyncGalToken is set to null:
			// - we don't supply a token attribute to <SyncGalRequest>, which means the entire gal is returned with the response, and
			// - when we get the response, we entirely replace the local copy of the GAL
		}
		else
		{
			this.state.SyncGalToken = this.state.zfcLastSync.get(this.state.sourceid_zm).getOrNull('SyncGalToken');

			this.state.m_logger.debug("entryActionSyncGal Gal hasn't expired - this.state.SyncGalToken == " + this.state.SyncGalToken);
		}

		this.setupSoapCall(state, 'evNext', "SyncGal", this.state.SyncGalToken);

		nextEvent = 'evSoapRequest';
	}

	continuation(nextEvent);
}

SyncFsm.prototype.exitActionSyncGal = function(state, event)
{
	if (!this.state.m_soap_state.m_response || event == "evCancel")
		return;

	var SyncGalToken = null;
	var functor = new FunctorArrayOfContactsFromNodes(ZinXpath.nsResolver("za")); // see SyncGalResponse below
	var response = this.state.m_soap_state.m_response;

	var node = ZinXpath.getSingleValue("/soap:Envelope/soap:Body/za:SyncGalResponse/@token", response, response);

	if (node && node.nodeValue)
		SyncGalToken = node.nodeValue;
	else
		this.state.m_logger.warn("SyncGalResponse received without a token attribute - don't know how to handle so ignoring it...");

	// zimbra server versions 4.0.x and 4.5 does some caching thing whereby it returns <cn> elements
	// in the SyncGalResponse even though the token is unchanged vs the previous response.
	//
	// Here, aSyncGalContact gets populated with the <cn> child elements of <SyncGalResponse> only when
	// the token attribute is present and different from the previous response.
	//
	if (SyncGalToken != null && SyncGalToken != this.state.SyncGalToken)
	{
		ZinXpath.runFunctor(functor, "/soap:Envelope/soap:Body/za:SyncGalResponse/za:cn", this.state.m_soap_state.m_response);

		this.state.SyncGalToken        = SyncGalToken;
		this.state.SyncGalTokenChanged = true;

		this.state.aSyncGalContact     = functor.a;
		this.state.mapIdSyncGalContact = functor.mapId;

		if (0)
		{
		this.state.m_logger.debug("11443378: SyncGalToken            == " + SyncGalToken );
		this.state.m_logger.debug("11443378: this.state.SyncGalToken == " + this.state.SyncGalToken );

		for (var i in this.state.aSyncGalContact)
			this.state.m_logger.debug("11443378: aSyncGalContact[" + i + "] == \n" + this.state.aSyncGalContact[i].toString());

		for (var id in this.state.mapIdSyncGalContact)
			this.state.m_logger.debug("11443378: mapIdSyncGalContact." + id + " == " + this.state.mapIdSyncGalContact[id]);
		}
	}
	else
		this.state.m_logger.debug("exitActionSyncGal: SyncGalResponse: token is unchanged - ignoring any <cn> elements in the response");
}

// the reference to this.state.SyncMd here is why SyncGalCommit must come *after* SyncResponse
//
SyncFsm.prototype.entryActionSyncGalCommit = function(state, event, continuation)
{
	var aAdd   = new Array(); // each element in the array is an index into aSyncGalContact
	var abName = APP_NAME + ">" + SyncFsm.ABSPECIAL_GAL;
	var uri    = ZimbraAddressBook.getAddressBookUri(abName);

	if (this.state.isZimbraFeatureGalEnabled && uri == null)
	{
		ZimbraAddressBook.newAddressBook(abName);

		uri = ZimbraAddressBook.getAddressBookUri(abName);
	}

	if (!this.state.isZimbraFeatureGalEnabled)
	{
		if (uri)
			ZimbraAddressBook.deleteAddressBook(uri);

		if (this.state.zfcLastSync.get(this.state.sourceid_zm).isPresent('SyncGalToken'))
			this.state.zfcLastSync.get(this.state.sourceid_zm).del('SyncGalToken');
	}
	else if (!uri)
		this.state.m_logger.error("Unable to find or create the GAL addresbook - skipping GAL sync");
	else if (this.state.aSyncGalContact == null)
		this.state.m_logger.debug("entryActionSyncGal: - nothing to commit - SyncGalToken: " + this.state.SyncGalToken);
	else
	{
		// since aSyncGalContact is only populated if there's a change in token, it seems reasonable to assert that length is > 0
		//
		zinAssert(this.state.aSyncGalContact.length > 0 && this.state.SyncGalTokenChanged);

		for (var i in this.state.aSyncGalContact)
		{
			var properties = ZinContactConverter.instance().convert(FORMAT_TB, FORMAT_ZM, this.state.aSyncGalContact[i].element);
			this.state.aSyncGalContact[i].checksum = ZimbraAddressBook.contactPropertyChecksum(properties);
		}

		if (this.state.SyncGalTokenChanged) // wipe all contacts
		{
			// flush cards out of the GAL address book that don't match cards in the contacts received from zimbra and
			// if there's a match, mark the corresponding zimbra contact so that it doesn't get added again below
			//
			this.state.m_logger.debug("this.state.SyncGalTokenChanged == true so wiping contacts that aren't in the SyncGalResponse");
			var context = this;

			var functor = {
				state: this.state,

				run: function(uri, item)
				{
					var abCard  = item.QueryInterface(Components.interfaces.nsIAbCard);
					var mdbCard = item.QueryInterface(Components.interfaces.nsIAbMDBCard);

					var id =  mdbCard.getStringAttribute(TBCARD_ATTRIBUTE_LUID);
					var checksum =  mdbCard.getStringAttribute(TBCARD_ATTRIBUTE_CHECKSUM);

					var index = context.state.mapIdSyncGalContact[id];

					this.state.m_logger.debug("forEachCard() functor abCard.mailListURI == " + abCard.mailListURI);

					if (id != null && typeof index != 'undefined' && checksum == context.state.aSyncGalContact[index].checksum)
					{
						context.state.aSyncGalContact[index].present = true;
						this.state.m_logger.debug("GAL card present in SyncGalResponse: " + ZimbraAddressBook.nsIAbCardToPrintable(abCard));
					}
					else
					{
						this.cardsToBeDeletedArray.AppendElement(abCard);
						this.state.m_logger.debug("GAL card marked for deletion: " + ZimbraAddressBook.nsIAbCardToPrintable(abCard));
					}

					return true;
				}
			};

			functor.cardsToBeDeletedArray = Components.classes["@mozilla.org/supports-array;1"].createInstance().
		                     QueryInterface(Components.interfaces.nsISupportsArray);

			ZimbraAddressBook.forEachCard(uri, functor);

			ZimbraAddressBook.deleteCards(uri, functor.cardsToBeDeletedArray);

			for (var i in this.state.aSyncGalContact)
				if (!this.state.aSyncGalContact[i].present)
					aAdd.push(i);
		}
		else
		{
			for (var i in this.state.aSyncGalContact)
				aAdd.push(i);
		}

		for (var i in aAdd)
		{
			var zc = this.state.aSyncGalContact[aAdd[i]];

			this.state.m_logger.debug("844324: about to write aSyncGalContact[" + aAdd[i] + "] == \n" + zc.toString());

			var attributes = newObject(TBCARD_ATTRIBUTE_LUID, zc.attribute.id, TBCARD_ATTRIBUTE_CHECKSUM, zc.checksum);
			var properties = ZinContactConverter.instance().convert(FORMAT_TB, FORMAT_ZM, zc.element);

			ZimbraAddressBook.addCard(uri, FORMAT_TB, properties, attributes);
		}

		this.state.zfcLastSync.get(this.state.sourceid_zm).set('SyncMd', this.state.SyncMd);
		this.state.zfcLastSync.get(this.state.sourceid_zm).set('SyncGalToken', this.state.SyncGalToken);
	}
		
	continuation('evNext');
}

SyncFsm.prototype.updateTbLuidMap = function()
{
	var functor_foreach_card, functor_foreach_addressbook;
	var uri;
	var sourceid = this.state.sourceid_tb;
	var zfcTb = this.state.sources[sourceid]['zfcLuid'];

	var bimapFolderLuid = ZinFeed.getTopLevelFolderLuidBimap(zfcTb, ZinFeedItem.ATTR_TPI, ZinFeedCollection.ITER_UNRESERVED);

	this.state.m_logger.debug("updateTbLuidMap: bimapFolderLuid == " + bimapFolderLuid.toString());

	// identify the zimbra addressbooks
	//
	functor_foreach_addressbook =
	{
		state:  this.state,
		prefix: ZinContactConverter.instance().convertFolderName(FORMAT_ZM, FORMAT_TB, ""),

		run: function(elem)
		{
			var msg = "addressbook:" +
			          " dirName: " + elem.dirName +
			          " dirPrefId: " + elem.dirPrefId +
			          " isRemote: " + elem.isRemote +
			          " lastModifiedDate: " + elem.lastModifiedDate +
			          " description: " + elem.description +
			          " supportsMailingLists: " + elem.supportsMailingLists +
			          " dirName: " + elem.dirName;

			// look for zindus/<folder-name> but don't permit '/'es in <folder-name> because:
			// (1) currently we only support addressbook folders that are immediate children of the root folder
			//     note the l='1' below.
			// (2) and we also want to exclude zindus/<server-name>/<folder-name>

			// this.state.m_logger.debug("updateTbLuidMap: blah: dirName: " + elem.dirName);
			// this.state.m_logger.debug("updateTbLuidMap: blah: prefix: " + this.prefix);
			// this.state.m_logger.debug("updateTbLuidMap: blah: prefix length: " + this.prefix.length);
			// this.state.m_logger.debug("updateTbLuidMap: blah: dirName.substring: " + elem.dirName.substring(0, this.prefix.length));
			// this.state.m_logger.debug("updateTbLuidMap: blah: dirName.indexOf: " + elem.dirName.indexOf("/", this.prefix.length));

			if (elem.directoryProperties.dirType == ZimbraAddressBook.kPABDirectory &&
			    ((elem.dirName.substring(0, this.prefix.length) == this.prefix &&
			     elem.dirName.indexOf("/", this.prefix.length) == -1) ||
			    (elem.dirName == TB_PAB) ) )
			{
				var id;

				var name = elem.dirName;
				msg = "addressbook of interest to zindus: " + msg;

				if (!bimapFolderLuid.isPresent(null, elem.dirPrefId))
				{
					id = ZinFeed.autoIncrement(zfcTb.get(ZinFeedItem.ID_AUTO_INCREMENT), 'next');

					zfcTb.set(new ZinFeedItem(ZinFeedItem.TYPE_FL, ZinFeedItem.ATTR_ID, id , 'l', 1, ZinFeedItem.ATTR_NAME, name,
					    ZinFeedItem.ATTR_MS, 1,
						ZinFeedItem.ATTR_TPI, elem.dirPrefId));
					
					msg = "added to the map: " + msg + " : " + zfcTb.get(id).toString();
				}
				else
				{
					id = bimapFolderLuid.lookup(null, elem.dirPrefId);

					// the mozilla addressbook hasn't implemented elem.lastModifiedDate (for folders)
					// so we do our own change detection

					var zfi = zfcTb.get(id);

					if (zfi.get(ZinFeedItem.ATTR_NAME) != name)
					{
						zfi.set(ZinFeedItem.ATTR_NAME, name);
						ZinFeed.autoIncrement(zfi, ZinFeedItem.ATTR_MS);

						msg += " - folder changed: " + zfi.toString();
					}
				}

				aUri[elem.directoryProperties.URI] = id;
				zfcTb.get(id).set('present', '1');  // this drives deletion detection

				msg += " - elem.directoryProperties." +
				       " URI: "      + elem.directoryProperties.URI +
				       " dirType: "  + elem.directoryProperties.dirType +
				       " position: " + elem.directoryProperties.position;
				msg += " id: " + id;

			}
			else
				msg = "ignored: " + msg;

			this.state.m_logger.debug("updateTbLuidMap: " + msg);
		
			return true;
		}
	};

	aUri = new Array();

	ZimbraAddressBook.forEachAddressBook(functor_foreach_addressbook);

	// when you iterate through cards in an addressbook, you also see cards that are members of mailing lists
	// and the only way I know of identifying such cards is to iterate to them via a mailing list uri.
	// So there's a 3-pass thing here:
	// pass 1 - iterate through the cards in the zindus folders building an associative array of mailing list uris
	//   aListUris['moz-abmdbdirectory://abook.mab/MailList3'] = true
	// pass 2 - iterate through the cards in the mailing list uris building an associative array of card keys
	//   a card key is a concatenation of mdbCard. dbTableID dbRowID key == 1 797 402
	//   aListCardKey['1-797-402'] = true;
	// pass 3 - iterate through the cards in the zindus folders excluding mailing list uris and cards with keys in aListCardKey
	//

	// pass 1 - iterate through the cards in the zindus folders building an associative array of mailing list uris
	//
	var aMailListUri = new Object();
	functor_foreach_card = {
		run: function(uri, item)
		{
			var abCard  = item.QueryInterface(Components.interfaces.nsIAbCard);

			if (abCard.isMailList)
				aMailListUri[abCard.mailListURI] = true;

			return true;
		}
	};

	for (uri in aUri)
		ZimbraAddressBook.forEachCard(uri, functor_foreach_card);

	this.state.m_logger.debug("1177 - pass 1 - aMailListUri == " + aToString(aMailListUri));

	// pass 2 - iterate through the cards in the mailing list uris building an associative array of card keys
	//
	var aCardKeysToExclude = new Object();

	functor_foreach_card = {
		run: function(uri, item)
		{
			var mdbCard = item.QueryInterface(Components.interfaces.nsIAbMDBCard);

			aCardKeysToExclude[ZimbraAddressBook.nsIAbMDBCardToKey(mdbCard)] = true;

			return true;
		}
	};

	for (uri in aMailListUri)
		ZimbraAddressBook.forEachCard(uri, functor_foreach_card);

	this.state.m_logger.debug("1177 - pass 2 - aCardKeysToExclude == " + aToString(aCardKeysToExclude));

	// pass 3 - iterate through the cards in the zindus folders excluding mailing list uris and cards with keys in aCardKeysToExclude
	//
	functor_foreach_card = {
		state: this.state,

		run: function(uri, item)
		{
			var abCard  = item.QueryInterface(Components.interfaces.nsIAbCard);
			var mdbCard = item.QueryInterface(Components.interfaces.nsIAbMDBCard);
			var msg = "1177 - pass 3 - card key: " + ZimbraAddressBook.nsIAbMDBCardToKey(mdbCard);

			// this.state.m_logger.debug("1177 - pass 3: blah: " +
			//                           " key: " + ZimbraAddressBook.nsIAbMDBCardToKey(mdbCard) +
			//                           " card: " + ZimbraAddressBook.nsIAbCardToPrintable(abCard) +
			//                           " abCard.isMailList: " + abCard.isMailList );

			if ( !abCard.isMailList && !isPropertyPresent(aCardKeysToExclude, ZimbraAddressBook.nsIAbMDBCardToKey(mdbCard)))
			{
				var id = mdbCard.getStringAttribute(TBCARD_ATTRIBUTE_LUID);

				if (! (id > ZinFeedItem.ID_MAX_RESERVED)) // id might be null (not present) or zero (reset after the map was deleted)
				{
					id = ZinFeed.autoIncrement(zfcTb.get(ZinFeedItem.ID_AUTO_INCREMENT), 'next');

					mdbCard.setStringAttribute(TBCARD_ATTRIBUTE_LUID, id);

					zfcTb.set(new ZinFeedItem(ZinFeedItem.TYPE_CN, ZinFeedItem.ATTR_ID, id , ZinFeedItem.ATTR_MD, abCard.lastModifiedDate, ZinFeedItem.ATTR_REV, 1, 'l', aUri[uri]));

					msg += " added:   " + ZimbraAddressBook.nsIAbCardToPrintable(abCard) + " - map: " + zfcTb.get(id).toString();
				}
				else
				{
					var zfi = zfcTb.get(id);

					// if things have changed, update the map...
					//
					if (zfi.get('l') != aUri[uri] || zfi.get(ZinFeedItem.ATTR_MD) != abCard.lastModifiedDate)
					{
						// abCard.lastModifiedDate is a bit flaky...
						// 1. it is set to '0' when the contact is first created
						// 2. moving a contact to a different folder then back resets lastModifiedDate to zero
						//    so someone could create it, sync, move it to a different folder, change it, moving it back
						//    and it'd look as if there was no change.
						// TODO - might need to update ZinFeedItem.ATTR_REV based on a change in checksum, rather than abCard.lastModifiedDate

						zfi.set(ZinFeedItem.ATTR_MD, abCard.lastModifiedDate);
						zfi.set('l', aUri[uri]);
						ZinFeed.autoIncrement(zfi, ZinFeedItem.ATTR_REV);

						msg += " changed: " + ZimbraAddressBook.nsIAbCardToPrintable(abCard) + " - map: " + zfi.toString();
					}
					else
						msg += " found:   " + ZimbraAddressBook.nsIAbCardToPrintable(abCard) + " - map: " + zfi.toString();
				}

				zfcTb.get(id).set('present', '1');
			}
			else
				msg += " - ignored";

			this.state.m_logger.debug(msg);

			return true;
		}
	};

	for (uri in aUri)
		ZimbraAddressBook.forEachCard(uri, functor_foreach_card);

	// deletion detection works as follows.
	// 1. a 'present' attribute was added in pass 3 above
	// 2. iterate through the map
	//    - an item without a 'present' attribute is marked as deleted
	//    - remove the 'present' attribute so that it's not saved
	// 

	var functor_mark_deleted = {
		state: this.state,

		run: function(zfi)
		{
			if (zfi.isPresent(ZinFeedItem.ATTR_DEL))
				; // do nothing
			else if (zfi.isPresent('present'))
				zfi.del('present');
			else
			{
				zfi.set(ZinFeedItem.ATTR_DEL, 1);
				this.state.m_logger.debug("1177 - marking as deleted: " + zfi.toString());
				ZinFeed.autoIncrement(zfi, (zfi.type() == ZinFeedItem.TYPE_FL) ? ZinFeedItem.ATTR_MS : ZinFeedItem.ATTR_REV);
			}

			return true;
		}
	};

	zfcTb.forEach(functor_mark_deleted, ZinFeedCollection.ITER_UNRESERVED);
}

SyncFsm.isOfInterest = function(zfc, id)
{
	gLogger.debug("SyncFsm.isOfInterest: blah: arguments.length: " + arguments.length + " zfc: " + (zfc ? "non-null" : "null") +
	              " id: " + id + " zfc.isPresent(id): " + zfc.isPresent(id));

	zinAssert(arguments.length == 2 && zfc && id && id > 0 && zfc.isPresent(id));

	var zfi = zfc.get(id);
	var l   = zfi.get('l');
	var ret = null;

	switch (zfi.type())
	{
		case ZinFeedItem.TYPE_FL:
			ret = (l == 1) && zfi.get('id') != ZIMBRA_ID_TRASH;
			break;
		case ZinFeedItem.TYPE_CN:
			// not sure how a contact could end up at the very top level but maybe it's possible!
			ret = (l == 1) ? false : SyncFsm.isOfInterest(zfc, l);
			break;
		default:
			zinAssert(false);
	}

	return ret;
}

SyncFsm.addToGid = function(zfcGid, sourceid, luid, reverse)
{
	var gid = ZinFeed.autoIncrement(zfcGid.get(ZinFeedItem.ID_AUTO_INCREMENT), 'next');

	zfcGid.set(new ZinFeedItem(null, ZinFeedItem.ATTR_ID, gid, 'present', 1, sourceid, luid));

	reverse[sourceid][luid] = gid;

	return gid;
}

SyncFsm.prototype.twinInGid = function(sourceid, luid, sourceid_tb, luid_tb, reverse)
{
	var zfcGid  = this.state.zfcGid;

	zinAssert(isPropertyPresent(reverse[sourceid_tb], luid_tb));

	var gid = reverse[sourceid_tb][luid_tb];
	zfcGid.get(gid).set(sourceid, luid);
	reverse[sourceid][luid] = gid;

	// set the VER attribute in the gid and the LS attributes in the luid maps
	// so that the compare algorithm can decide that there's no change.
	//
	var zfcTb = this.state.sources[sourceid_tb]['zfcLuid'];
	var zfcZm = this.state.sources[sourceid]['zfcLuid'];

	this.resetLsoVer(gid, zfcTb.get(luid_tb));          // set VER in gid and LS attribute in the tb luid map
	SyncFsm.setLsoToGid(zfcGid.get(gid), zfcZm.get(luid)); // set                LS attribute in the zm luid map

	return gid;
}

SyncFsm.prototype.updateGidFromSources = function()
{
	var zfcGid  = this.state.zfcGid;
	var reverse = this.state.aReverseGid; // bring it into the local namespace
	var zfc, format;

	var functor_foreach_luid_fast_sync = {
		state: this.state,

		run: function(zfi)
		{
			var luid = zfi.id();
			var msg  = "functor_foreach_luid_fast_sync: building gid - sourceid: " + sourceid + " and luid: " + luid;

			if (isPropertyPresent(reverse[sourceid], luid))
			{
				zfcGid.get(reverse[sourceid][luid]).set('present', 1);
				msg += " - already in gid";
			}
			else if (SyncFsm.isOfInterest(zfc, zfi.id()))
			{
				var gid = SyncFsm.addToGid(zfcGid, sourceid, luid, reverse);

				msg += " - added to gid: " + gid;
			}
			else
				msg += " - luid is not of interest - ignoring";

			this.state.m_logger.debug(msg);

			return true;
		}
	};

	var functor_foreach_luid_slow_sync = {
		state: this.state,
		context: this,
		bimapFolderLuid: ZinFeed.getTopLevelFolderLuidBimap(this.state.sources[this.state.sourceid_tb]['zfcLuid'],
		                                   ZinFeedItem.ATTR_NAME, ZinFeedCollection.ITER_UNRESERVED),

		run: function(zfi)
		{
			var luid = zfi.id();
			var msg  = "functor_foreach_luid_slow_sync: building gid - sourceid: " + sourceid + " and luid: " + luid;
			var luid_tb = null;
			var gid;

			zinAssert(!isPropertyPresent(reverse[sourceid], luid));

			if (SyncFsm.isOfInterest(zfc, zfi.id()))
			{
				if (zfi.type() == ZinFeedItem.TYPE_FL)
				{
					// TODO - find the folder in the tb source and use it's gid
					var name   = zfi.get(ZinFeedItem.ATTR_NAME);
					var abName = ZinContactConverter.instance().convertFolderName(FORMAT_ZM, FORMAT_TB, name);

					if (this.bimapFolderLuid.isPresent(null, abName))
					{
						luid_tb = this.bimapFolderLuid.lookup(null, abName);
						gid = this.context.twinInGid(sourceid, luid, this.state.sourceid_tb, luid_tb, reverse)
						msg += " twin: folder with tb luid: " + luid_tb + " at gid: " + gid;
					}
					else
					{
						var gid = SyncFsm.addToGid(zfcGid, sourceid, luid, reverse);
						msg += " added to gid: " + gid;
					}
				}
				else
				{
					zinAssert(zfi.type() == ZinFeedItem.TYPE_CN);
					zinAssert(zfi.isPresent(ZinFeedItem.ATTR_CS));
					var checksum = zfi.get(ZinFeedItem.ATTR_CS);
					var luid_parent = zfi.get('l');
					var name_parent = ZinContactConverter.instance().convertFolderName(FORMAT_ZM, FORMAT_TB,
					                                                                   zfc.get(luid_parent).get(ZinFeedItem.ATTR_NAME));

					var key = hyphenate('-', this.state.sourceid_tb, name_parent, checksum);

					this.state.m_logger.debug("functor_foreach_luid_slow_sync: blah: key: " + key);

					if (isPropertyPresent(aChecksum, key) && aToLength(aChecksum[key]) > 0)
					{
						// matched a checksum - treat this as a twin for the moment - TODO - confirm that the fields match...
						//
						for (var luid_possible in aChecksum[key])
							if (aChecksum[key][luid_possible])
							{
								// effectively this takes the first key in the bucket - will get more sophisticated as I test for equivalence
								luid_tb = luid_possible;
								break;
							}

						this.state.m_logger.debug("functor_foreach_luid_slow_sync: blah: matched a checksum: luid_tb: " + luid_tb);
					}

					if (luid_tb)
					{
						this.state.m_logger.debug("functor_foreach_luid_slow_sync: blah: twin: luid_tb: " + luid_tb);
						gid = this.context.twinInGid(sourceid, luid, this.state.sourceid_tb, luid_tb, reverse);
						msg += " twin: contact with tb luid: " + luid_tb + " at gid: " + gid;

						delete aChecksum[key][luid_tb];
					}
					else
					{
						var gid = SyncFsm.addToGid(zfcGid, sourceid, luid, reverse);
						msg += " added to gid: " + gid;
					}
				}
			}
			else
				msg += " - luid is not of interest - ignoring";

			this.state.m_logger.debug(msg);

			return true;
		}
	};

	var functor_foreach_luid_do_checksum = {
		state: this.state,
		context: this,

		run: function(zfi)
		{
			var luid     = zfi.id();
			var checksum = null;
			var luid_parent;

			if (!SyncFsm.isOfInterest(zfc, zfi.id()))
				this.state.m_logger.debug("functor_foreach_luid_do_checksum: sourceid: " + sourceid + " luid: " + luid +
				                          " - not of interest");
			else if (zfi.type() == ZinFeedItem.TYPE_CN)
			{
				var properties;
				var name_parent;

				luid_parent = zfi.get('l');

				if (this.state.sources[sourceid]['format'] == FORMAT_TB)
				{
					zinAssert(zfi.isPresent('l'));

					name_parent = this.context.getTbAddressbookNameFromLuid(sourceid, luid_parent);
					var uri     = ZimbraAddressBook.getAddressBookUri(name_parent);
					var abCard  = uri ? ZimbraAddressBook.lookupCard(uri, TBCARD_ATTRIBUTE_LUID, luid) : null;
					properties  = abCard ? ZimbraAddressBook.getCardProperties(abCard) : null;

					if (!properties)
					{
						this.state.m_logger.warn("functor_foreach_luid_do_checksum: unable to retrieve properties for card: " +
						                         " sourceid: " + sourceid + " luid: " + luid + " uri: " + uri);
						return true; // no checksum for this card means it'll never be part of a twin
					}
				}
				else
				{
					zinAssert(isPropertyPresent(this.state.aSyncContact, luid));
					properties = ZinContactConverter.instance().convert(FORMAT_TB, FORMAT_ZM, this.state.aSyncContact[luid].element);
					name_parent = ZinContactConverter.instance().convertFolderName(FORMAT_ZM, FORMAT_TB, zfc.get(luid_parent).get(ZinFeedItem.ATTR_NAME));
				}

				checksum = ZimbraAddressBook.crc32(properties);
				var key = hyphenate('-', sourceid, name_parent, checksum);

				if (!isPropertyPresent(aChecksum, key))
					aChecksum[key] = new Object();

				aChecksum[key][luid] = true;

				zfi.set(ZinFeedItem.ATTR_CS, checksum);
			}

			this.state.m_logger.debug("functor_foreach_luid_do_checksum: sourceid: " + sourceid + " luid: " + luid +
			                          " checksum: " + (checksum ? (checksum + " name_parent: " + name_parent) : " doesn't apply to this folder") );

			return true;
		}
	};

	var isSlowSync = false;

	for (sourceid in this.state.sources)
		if (this.state.sources[sourceid]['format'] == FORMAT_ZM && this.isSlowSync(sourceid))
			isSlowSync = true;

	if (isSlowSync)
	{
		var aChecksum = new Object(); // aChecksum[sourceid][checksum][luid] = true;

		for (sourceid in this.state.sources)
		{
			zfc = this.state.sources[sourceid]['zfcLuid'];

			zfc.forEach(functor_foreach_luid_do_checksum, SyncFsm.forEachFlavour(this.state.sources[sourceid]['format']));
		}

		// this.state.m_logger.debug("updateGidFromSources: aChecksum: ");
		// for (var key in aChecksum)
		// 	this.state.m_logger.debug("   key: " + key + " : " + aChecksum[key]);
	}

	for (sourceid in this.state.sources)
	{
		zfc    = this.state.sources[sourceid]['zfcLuid'];
		format = this.state.sources[sourceid]['format'];

		// zfc.forEach(functor_foreach_luid_fast_sync, SyncFsm.forEachFlavour(this.state.sources[sourceid]['format']));

		if ((format == FORMAT_TB) || (format == FORMAT_ZM && !this.isSlowSync(sourceid)))
			zfc.forEach(functor_foreach_luid_fast_sync, SyncFsm.forEachFlavour(this.state.sources[sourceid]['format']));
		else
			zfc.forEach(functor_foreach_luid_slow_sync, SyncFsm.forEachFlavour(this.state.sources[sourceid]['format']));
	}

	// sanity check - ensure that all gid's have been visited
	//
	var functor_foreach_gid = {
		state: this.state,

		run: function(zfi)
		{
			if (zfi.isPresent('present'))
				zfi.del('present');
			else
			{
				this.state.m_logger.warn("Found a gid unreferenced by any sourceid/luid.  This shouldn't happen.  Deleting...");
				zfcGid.del(zfi.id());
			}

			return true;
		}
	};

	zfcGid.forEach(functor_foreach_gid, ZinFeedCollection.ITER_UNRESERVED);

	this.state.m_logger.debug("1177 - after updateGidFromSources(), zfcGid: " + zfcGid.toString());
	this.state.m_logger.debug("1177 - after updateGidFromSources(), reverse: " + aToString(this.state.aReverseGid));
}

SyncFsm.prototype.buildGcs = function()
{
	var aGcs          = new Object();  // an associative array where the key is a gid and the value is a Gcs object
	var aZfcCandidate = new Object();  // a copy of the luid maps updated as per this sync
	var sourceid_tb   = this.state.sourceid_tb;
	var zfcGid        = this.state.zfcGid;
	var reverse       = this.state.aReverseGid; // bring it into the local namespace

	for (var i in this.state.sources)
		aZfcCandidate[i] = zinCloneObject(this.state.sources[i]['zfcLuid']); // cloned because items get deleted out of this during merge

	// delete candidate mapitems in other sources once they've been compared
	//
	var functor_delete_other_candidate_mapitems = {
		run: function(key, value)
		{
			if (key != ZinFeedItem.ATTR_VER && key != sourceid)
				aZfcCandidate[key].del(value);

			return true;
		}
	};

	var functor_foreach_candidate = {
		state: this.state,

		run: function(zfi)
		{
			this.state.m_logger.debug("885438 - about to determine winner for:");
			this.state.m_logger.debug("885438 - sourceid: " + sourceid + " zfi: " + zfi.toString());

			if (SyncFsm.isOfInterest(sources[sourceid]['zfcLuid'], zfi.id()))
			{
				var luid = zfi.id();
				var gid  = reverse[sourceid][luid];

				zinAssert(isPropertyPresent(reverse, sourceid) && isPropertyPresent(reverse[sourceid], luid));

				aGcs[gid] = this.compare(gid);// aZfcCandidate, reverse, zfcGid

				zfcGid.get(gid).forEach(functor_delete_other_candidate_mapitems, ZinFeedItem.ITER_SOURCEID);
			}
			else
				this.state.m_logger.debug("885438 - zfi not of interest - compare skipped - sourceid: " + sourceid + " zfi: " + zfi.toString());

			return true;
		},

		compare: function(gid)
		{
			var aNeverSynced   = new Object();
			var aChangeOfNote  = new Object(); // not any old change, but a change where the ms or md attributes incremented
			var aVerMatchesGid = new Object();
			var ret = null;

			var functor_each_luid_in_gid = {
				state: this.state,

				run: function(sourceid, luid)
				{
					if (sourceid == ZinFeedItem.ATTR_VER)
						return true;

					var zfi = aZfcCandidate[sourceid].get(luid);
					var msg = "885435 - sourceid: " + sourceid + " zfi: " + zfi.toString();

					if (!zfi.isPresent(ZinFeedItem.ATTR_LS))
					{
						aNeverSynced[sourceid] = true;
						msg += " added to aNeverSynced";
					}
					else
					{
						var lso = new Lso(zfi.get(ZinFeedItem.ATTR_LS));
						var gid = reverse[sourceid][luid];

						this.state.m_logger.debug("885438 - gid: " + gid + " gid's ver: " + zfcGid.get(gid).get(ZinFeedItem.ATTR_VER) +
									                      " zfi: " + zfi.toString() +
						                                  " lso: " + lso.toString() + " lso.compare == " + lso.compare(zfi));

						if (lso.get(ZinFeedItem.ATTR_VER) == zfcGid.get(gid).get(ZinFeedItem.ATTR_VER))
						{
							var res = lso.compare(zfi);

							if (res == 0)
							{
								aVerMatchesGid[sourceid] = true;
								msg += " added to aVerMatchesGid";
							}
							else if (res == 1)
							{
								aChangeOfNote[sourceid] = true;
								msg += " added to aChangeOfNote";
							}
						}
					}

					this.state.m_logger.debug(msg);

					return true;
				}
			};

			zfcGid.get(gid).forEach(functor_each_luid_in_gid, ZinFeedItem.ITER_SOURCEID);

			var cNeverSynced   = aToLength(aNeverSynced);
			var cVerMatchesGid = aToLength(aVerMatchesGid);
			var cChangeOfNote  = aToLength(aChangeOfNote);

			this.state.m_logger.debug("885439 - aNeverSynced: "   + aToString(aNeverSynced));
			this.state.m_logger.debug("885439 - aVerMatchesGid: " + aToString(aVerMatchesGid));
			this.state.m_logger.debug("885439 - aChangeOfNote: "  + aToString(aChangeOfNote));

			zinAssert(cNeverSynced == 0 || cNeverSynced == 1);

			if (cNeverSynced == 1)
			{
				zinAssert(cVerMatchesGid == 0 && cChangeOfNote == 0);

				ret = new Gcs(propertyFromObject(aNeverSynced), Gcs.WIN);
				
				if (0)
				{
				if (cNeverSynced == 1)
					ret = new Gcs(propertyFromObject(aNeverSynced), Gcs.WIN);
				else
				{
					// a slow sync matched these items
					// by declaring tb the winner here, the zm sources get (unnecessarily) updated
					// and as a result, all the versioning meta-data gets set currently
					// at some point, this can be made more efficient by setting the versioning meta-data
					// when the twins are identified...
					zinAssert(isPropertyPresent(aNeverSynced, sourceid_tb));
					ret = new Gcs(sourceid_tb, Gcs.WIN);
				}
				}
			}
			else if (cChangeOfNote == 0)
			{
				zinAssert(isPropertyPresent(aVerMatchesGid, sourceid_tb));
				ret = new Gcs(sourceid_tb, Gcs.WIN);
			}
			else if (cChangeOfNote == 1)
				ret = new Gcs(propertyFromObject(aChangeOfNote), Gcs.WIN);
			else
			{
				var lowest_sourceid = 100000;

				for (var i in aChangeOfNote)
					if (aChangeOfNote[i] < lowest_sourceid)
						lowest_sourceid = aChangeOfNote[i];

				ret = new Gcs(lowest_sourceid, Gcs.CONFLICT);
			}

			this.state.m_logger.debug("885439 - compare(" + gid + ") returns: " + ret.toString());

			return ret;
		}
	};

	var sources = this.state.sources; // bring the name into scope

	for (sourceid in this.state.sources)
		aZfcCandidate[sourceid].forEach(functor_foreach_candidate, SyncFsm.forEachFlavour(this.state.sources[sourceid]['format']));
	
	for (var gid in aGcs)
		this.state.m_logger.debug("aGcs[" + gid + "]: " + aGcs[gid].toString());

	return aGcs;
}

// This method builds the list of (MDU) operations required to update the meta-data for winners.
// - if a winning item is new to the gid, generate an MDU operation (which will create the version)
// - if a winning item was already in the gid and changed, generate an MDU operation (which will bump it's version)
// - if a winning item was already in the gid but didn't change, do nothing
//
SyncFsm.prototype.suoBuildWinners = function(aGcs)
{
	var zfcGid     = this.state.zfcGid;
	var aSuoResult = new Array();
	var suo;

	for (var gid in aGcs)
	{
		suo = null;

		var msg = "55432 - suoBuildWinners:";

		switch (aGcs[gid].state)
		{
			case Gcs.WIN:
			case Gcs.CONFLICT:
				var winner    = aGcs[gid].sourceid_winner;
				var sourceid  = winner;
				var zfcWinner = this.state.sources[winner]['zfcLuid']; // this.getZfc(winner) 
				var zfiWinner = zfcWinner.get(zfcGid.get(gid).get(winner)); // this.getLuid(collection, sourceid)
				// this.getZfc(winner).getLuid(collection, sourceid)

				msg += " gid: " + gid + " target sourceid: " + sourceid;

				if (!zfiWinner.isPresent(ZinFeedItem.ATTR_LS)) // winner is new to gid
				{
					zinAssert(!zfcGid.get(gid).isPresent(ZinFeedItem.ATTR_VER));

					zinAssert(zfcGid.get(gid).length() == 2); // just the id property and the winning sourceid

					msg += " - winner is new to gid  - MDU";

					suo = new Suo(gid, aGcs[gid].sourceid_winner, sourceid, Suo.MDU);
				}
				else
				{
					var lso = new Lso(zfiWinner.get(ZinFeedItem.ATTR_LS));
					var res = lso.compare(zfiWinner);

					zinAssert(lso.get(ZinFeedItem.ATTR_VER) == zfcGid.get(gid).get(ZinFeedItem.ATTR_VER));
					zinAssert(res >= 0); // winner either changed in an interesting way or stayed the same

					if (res == 1)
					{
						msg += " - winner changed in an interesting way - MDU";
						suo = new Suo(gid, aGcs[gid].sourceid_winner, sourceid, Suo.MDU);
					}
					else
						msg += " - winner didn't change - do nothing";
				}
				break;

			default:
				zinAssert(false);
		}

		this.state.m_logger.debug(msg);

		if (suo != null)
			aSuoResult.push(suo);
	}

	return aSuoResult;
}


// The suo's returned by this method are organised into buckets to suit later processing (by source, by operation, by content type):
// - aSuo[sourceid][Suo.ADD | ZinFeedItem.TYPE_FL][id] = suo
// - for Suo.MOD and Suo.DEL, id is the target luid (so that the zimbra response can easily find the the corresponding suo,
// - for Suo.ADD, id is just an autoincremented number.
//

SyncFsm.prototype.suoBuildLosers = function(aGcs)
{
	var zfcGid     = this.state.zfcGid;
	var aSuoResult = new Object();
	var indexSuo   = 0;
	var suo;

	for (sourceid in this.state.sources)
		aSuoResult[sourceid] = new Object();

	for (var gid in aGcs)
		for (sourceid in this.state.sources)
			if (sourceid != aGcs[gid].sourceid_winner) // only look at losers
	{
		suo = null;

		var msg = "55434 - suoBuildLosers:";

		switch (aGcs[gid].state)
		{
			case Gcs.WIN:
			case Gcs.CONFLICT:
			{
				var winner = aGcs[gid].sourceid_winner;
				var zfcWinner = this.state.sources[winner]['zfcLuid'];
				var zfcTarget = this.state.sources[sourceid]['zfcLuid'];
				var zfiWinner = zfcWinner.get(zfcGid.get(gid).get(winner));

				msg += " gid: " + gid + " target sourceid: " + sourceid;

				if (!zfcGid.get(gid).isPresent(sourceid))
				{
					// when we delete, we actually move to trash on zimbra
					// when zimbra's trash gets emptied, we see the deletes, by which time the item is long gone from the original source
					// so here, we only add items to the gid if the winner is of interest (and not deleted)
					//
					if (!zfiWinner.isPresent(ZinFeedItem.ATTR_DEL) && SyncFsm.isOfInterest(zfcWinner, zfiWinner.id()))
					{
						msg += " - source not present in gid";
						suo = new Suo(gid, aGcs[gid].sourceid_winner, sourceid, Suo.ADD);
					}
				}
				else if (this.isLsoVerMatch(gid, zfcTarget.get(zfcGid.get(gid).get(sourceid))))
					msg += " lso and version match gid - do nothing"; // do nothing
				else if (zfiWinner.isPresent(ZinFeedItem.ATTR_DEL))
					suo = new Suo(gid, winner, sourceid, Suo.DEL);
				else if (!SyncFsm.isOfInterest(zfcWinner, zfiWinner.id()))
					suo = new Suo(gid, winner, sourceid, Suo.DEL);
				else
					suo = new Suo(gid, winner, sourceid, Suo.MOD);

				break;
			}
			default:
				zinAssert(false);
		}

		if (suo != null)
		{
			var bucket = this.suoOpcode(suo);

			if (!isPropertyPresent(aSuoResult[sourceid], bucket))
				aSuoResult[sourceid][bucket] = new Object();

			if (suo.opcode == Suo.ADD)
				aSuoResult[sourceid][bucket][indexSuo++] = suo;
			else
				aSuoResult[sourceid][bucket][this.state.zfcGid.get(gid).get(sourceid)] = suo;

			msg += " added suo: " + suo.toString();
		}

		this.state.m_logger.debug(msg);
	}

	return aSuoResult;
}

SyncFsm.prototype.settleSomeConflicts = function()
{
}

SyncFsm.prototype.buildPreUpdateWinners = function(aGcs)
{
	for (var gid in aGcs)
	{
		var sourceid = aGcs[gid].sourceid_winner;
		var zfc      = this.state.sources[sourceid]['zfcLuid'];
		var luid     = this.state.zfcGid.get(gid).get(sourceid);
		var zfi      = zinCloneObject(zfc.get(luid));

		zfi.set(ZinFeedItem.ATTR_ID, gid);

		this.state.zfcPreUpdateWinners.set(zfi);
	}
}

SyncFsm.prototype.suoRunWinners = function(aSuoWinners)
{
	for (var i = 0; i < aSuoWinners.length; i++)
	{
		suo = aSuoWinners[i];

		this.state.m_logger.debug("2277 - acting on suo: - " + " suo: "  + suo.toString());

		var zfcWinner   = this.state.sources[suo.sourceid_winner]['zfcLuid'];
		var luid_winner = this.state.zfcGid.get(suo.gid).get(suo.sourceid_winner);

		this.resetLsoVer(suo.gid, zfcWinner.get(luid_winner));
	}
}

SyncFsm.prototype.entryActionLoadTb = function(state, event, continuation)
{
	this.updateTbLuidMap();                      // 2.  update the local thunderbird map...
	continuation('evNext');
}

SyncFsm.prototype.entryActionSyncPrepare = function(state, event, continuation)
{
	var aSuoWinners;

	this.updateGidFromSources();                 // 4.  map all luids into a single namespace (the gid)
	var aGcs = this.buildGcs();                  // 5.  reconcile the sources (via the gid) into a single truth (the sse output array) 
	this.buildPreUpdateWinners(aGcs);            // 6.  save state of winners before they are updated (to distinguish an ms vs md update)
	this.settleSomeConflicts();                  // 7.  a bit of conflict handling
	aSuoWinners = this.suoBuildWinners(aGcs);    // 8.  generate operations required to bring meta-data for winners up to date
	this.suoRunWinners(aSuoWinners);             // 9.  run the operations for winners
	this.state.aSuo = this.suoBuildLosers(aGcs); // 10. generate the operations required to bring the losing sources up to date
	                                             // ... subsequent state(s) run the suo's for the losers in this.state.aSuo

	continuation('evNext');
}

SyncFsm.prototype.entryActionUpdateTb = function(state, event, continuation)
{
	var i, gid, id, type, sourceid_target, luid_winner, luid_target, zfcWinner, zfcTarget, zfcGid, zfiWinner, zfiGid;
	var zc, uri, abCard, l_winner, l_gid, l_target, l_current, properties, attributes, msg;

	var SORT_ORDER = [ Suo.DEL | ZinFeedItem.TYPE_CN, Suo.DEL | ZinFeedItem.TYPE_FL, 
	                   Suo.MOD | ZinFeedItem.TYPE_FL, Suo.MOD | ZinFeedItem.TYPE_CN,
	                   Suo.ADD | ZinFeedItem.TYPE_FL, Suo.ADD | ZinFeedItem.TYPE_CN ];

	for (var i = 0; i < SORT_ORDER.length; i++)
		if (isPropertyPresent(this.state.aSuo[this.state.sourceid_tb], SORT_ORDER[i]))
			for (var indexSuo in this.state.aSuo[this.state.sourceid_tb][SORT_ORDER[i]])
	{
		suo = this.state.aSuo[this.state.sourceid_tb][SORT_ORDER[i]][indexSuo];
		gid  = suo.gid;
		type = this.feedItemTypeFromGid(gid, suo.sourceid_winner);
		sourceid_winner = suo.sourceid_winner;
		sourceid_target = suo.sourceid_target;
		zfcWinner   = this.state.sources[sourceid_winner]['zfcLuid'];
		zfcTarget   = this.state.sources[sourceid_target]['zfcLuid'];
		zfcGid      = this.state.zfcGid;
		luid_winner = zfcGid.get(gid).get(sourceid_winner);
		zfiGid      = zfcGid.get(gid);
		zfiWinner   = zfcWinner.get(luid_winner);
		luid_target = null;  // if non-null at the bottom of loop, it means that a change was made
		msg = "";

		this.state.m_logger.debug("entryActionUpdateTb: acting on suo: - opcode: " + Suo.opcodeAsString(SORT_ORDER[i] & Suo.MASK)
			+ " type: " + ZinFeedItem.typeAsString(SORT_ORDER[i] & ZinFeedItem.TYPE_MASK)
			+ " suo: "  + this.state.aSuo[this.state.sourceid_tb][SORT_ORDER[i]][indexSuo].toString());


		switch(SORT_ORDER[i])
		{
			case Suo.ADD | ZinFeedItem.TYPE_CN:
				// allocate a new luid in the source map
				// add to thunderbird addressbook
				// add the luid in the source map (zfc)
				// update the gid with the new luid
				// update the reverse array 

				luid_target = ZinFeed.autoIncrement(zfcTarget.get(ZinFeedItem.ID_AUTO_INCREMENT), 'next');

				zinAssert(this.state.aSyncContact, luid_winner);
				zc = this.state.aSyncContact[luid_winner]; // the ZimbraContact object that arrived via GetContactResponse

				msg += "About to add a contact to the thunderbird addressbook, gid: " + gid + " and luid_winner: " + luid_winner;

				zinAssert(typeof(zc != 'undefined'));

				attributes = newObject(TBCARD_ATTRIBUTE_LUID, luid_target);
				properties = ZinContactConverter.instance().convert(FORMAT_TB, FORMAT_ZM, zc.element);

				msg += " properties: " + aToString(properties) + " and attributes: " + aToString(attributes);

				l_winner = zfiWinner.get('l');                                // luid of the parent folder in the source
				                                                              this.state.m_logger.debug("84739: l_winner: " + l_winner);
				l_gid    = this.state.aReverseGid[sourceid_winner][l_winner]; // gid  of the parent folder
				                                                              this.state.m_logger.debug("84739: l_gid: " + l_gid);
				l_target = zfcGid.get(l_gid).get(sourceid_target);            // luid of the parent folder in the target
				uri      = ZimbraAddressBook.getAddressBookUri(this.getTbAddressbookNameFromLuid(sourceid_target, l_target));
				abCard   = ZimbraAddressBook.addCard(uri, FORMAT_TB, properties, attributes);

				// msg += " l_winner: " + l_winner + " l_gid: " + l_gid + " l_target: " + l_target + " parent uri: " + uri;

				zfcTarget.set(new ZinFeedItem(ZinFeedItem.TYPE_CN, ZinFeedItem.ATTR_ID, luid_target ,
				                                                   ZinFeedItem.ATTR_MD, abCard.lastModifiedDate,
				                                                   ZinFeedItem.ATTR_REV, 1,
				                                                   'l', l_target));

				zfiGid.set(sourceid_target, luid_target);
				this.state.aReverseGid[sourceid_target][luid_target] = gid;
				break;

			case Suo.ADD | ZinFeedItem.TYPE_FL:
				var name   = zfiWinner.get(ZinFeedItem.ATTR_NAME);
				var abName = ZinContactConverter.instance().convertFolderName(FORMAT_ZM, FORMAT_TB, name);

				if (!ZimbraAddressBook.getAddressBookUri(abName))
				{
					msg += "About to add a thunderbird addressbook (folder), gid: " + gid + " and luid_winner: " + luid_winner;

					uri = ZimbraAddressBook.newAddressBook(abName);

					luid_target = ZinFeed.autoIncrement(zfcTarget.get(ZinFeedItem.ID_AUTO_INCREMENT), 'next');

					zfcTarget.set(new ZinFeedItem(ZinFeedItem.TYPE_FL, ZinFeedItem.ATTR_ID, luid_target, ZinFeedItem.ATTR_NAME, abName, 'l', 1,
					                       ZinFeedItem.ATTR_MS, 1,
										   ZinFeedItem.ATTR_TPI, ZimbraAddressBook.getAddressBookPrefId(uri)));

					zfiGid.set(sourceid_target, luid_target);
					this.state.aReverseGid[sourceid_target][luid_target] = gid;
				}
				else
					this.state.m_logger.warn("Was about to create an addressbook: " + abName + " but it already exists.");  // TODO - this might happen if the user created an addressbook both locally and on a server with the same name - how to handle?

				break;

			case Suo.MOD | ZinFeedItem.TYPE_CN:
				// there are two scenarios here:
				// 1. the contact's content didn't change, it just got moved from one folder to another (l attribute in the map changed)
				// 2. the contact's content changed (might have changed folders as well)
				// These scenarios are distinguished by whether the zimbra server bumped the rev attribute or not.
				// See: http://wiki.ho.moniker.net/index.php/LedapZimbraSynchronisation#rev_attribute
				// A content change bumps the rev attribute in which case we would have issued a GetContactRequest
				// So in the event of a content change, the source is this.state.aSyncContact[luid_winner],
				// otherwise it's the contact in the thunderbird addressbook.
				//
				luid_target = zfiGid.get(sourceid_target);
				l_winner    = zfiWinner.get('l');                                // luid of the parent folder in the winner
				l_gid       = this.state.aReverseGid[sourceid_winner][l_winner]; // gid  of the parent folder
				l_target    = zfcGid.get(l_gid).get(sourceid_target);            // luid of the winner's parent folder in the target
				l_current   = zfcTarget.get(luid_target).get('l');               // luid of the target's parent folder before changes

				msg += "About to modify a contact in the addressbook, gid: " + gid;
				msg += " l_winner: " + l_winner + " l_gid: " + l_gid + " l_target: " + l_target + " l_current: " + l_current;

				if (l_target == l_current)
				{
					// if the parent folder hasn't changed, there must have been a content change on the server
					// in which case rev was bumped and we issued a GetContactRequest
					// Now, overwrite the card...
					//
					msg += " - parent folder hasn't changed";

					zinAssert(isPropertyPresent(this.state.aSyncContact, luid_winner));

					uri    = ZimbraAddressBook.getAddressBookUri(this.getTbAddressbookNameFromLuid(sourceid_target, l_target));
					// this.state.m_logger.debug("entryActionUpdateTb: uri: " + uri + " luid_target: " + luid_target);
					abCard = ZimbraAddressBook.lookupCard(uri, TBCARD_ATTRIBUTE_LUID, luid_target);
					// this.state.m_logger.debug("entryActionUpdateTb: card: " + abCard);

					if (abCard)
					{
						zc = this.state.aSyncContact[luid_winner];

						attributes = newObject(TBCARD_ATTRIBUTE_LUID, luid_target);
						properties = ZinContactConverter.instance().convert(FORMAT_TB, FORMAT_ZM, zc.element);

						msg += " setting card to: properties: " + aToString(properties) + " and attributes: " + aToString(attributes);

						ZimbraAddressBook.updateCard(abCard, uri, FORMAT_TB, properties, attributes);
					}
				}
				else
				{
					msg += " - parent folder changed"; // implement as delete+add

					var uri_from = ZimbraAddressBook.getAddressBookUri(this.getTbAddressbookNameFromLuid(sourceid_target, l_current));
					var uri_to   = ZimbraAddressBook.getAddressBookUri(this.getTbAddressbookNameFromLuid(sourceid_target, l_target));
					abCard       = ZimbraAddressBook.lookupCard(uri_from, TBCARD_ATTRIBUTE_LUID, luid_target);

					if (abCard)
					{
						if (isPropertyPresent(this.state.aSyncContact, luid_winner))
						{
							zc         = this.state.aSyncContact[luid_winner];
							attributes = newObject(TBCARD_ATTRIBUTE_LUID, luid_target);
							properties = ZinContactConverter.instance().convert(FORMAT_TB, FORMAT_ZM, zc.element);

							msg += " - content changed";
						}
						else
						{
							attributes = ZimbraAddressBook.getCardAttributes(abCard);
							properties = ZimbraAddressBook.getCardProperties(abCard);

							msg += " - content didn't change";
						}

						var cardsToBeDeletedArray = Components.classes["@mozilla.org/supports-array;1"].createInstance().
						                                   QueryInterface(Components.interfaces.nsISupportsArray);
						cardsToBeDeletedArray.AppendElement(abCard);

						ZimbraAddressBook.deleteCards(uri_from, cardsToBeDeletedArray);

						msg += " - card deleted - card added: properties: " + aToString(properties) + " and attributes: " + aToString(attributes);

						ZimbraAddressBook.addCard(uri_to, FORMAT_TB, properties, attributes);
					}
				}

				if (abCard)
					zfcTarget.set(new ZinFeedItem(ZinFeedItem.TYPE_CN, ZinFeedItem.ATTR_ID, luid_target , ZinFeedItem.ATTR_MD, abCard.lastModifiedDate, ZinFeedItem.ATTR_REV, 1, 'l', l_target));  // rev gets reset to 1 on each modification - no big deal
				else
				{
					luid_target = null;
					this.state.m_logger.warn("Can't find card to modify in the addressbook: luid: "+ luid_target + " - this shouldn't happen.");
				}

				break;

			case Suo.MOD | ZinFeedItem.TYPE_FL:
				luid_target = zfiGid.get(sourceid_target);
				uri         = ZimbraAddressBook.getAddressBookUri(this.getTbAddressbookNameFromLuid(sourceid_target, luid_target));

				if (uri)
				{
					msg += "About to rename a thunderbird addressbook (folder), gid: " + gid + " and luid_winner: " + luid_winner;

					zinAssert(zfiWinner.get('l') == 1); // luid of the parent folder in the winner == 1

					var name_winner = this.getTbAddressbookNameFromLuid(sourceid_winner, luid_winner);
					ZimbraAddressBook.renameAddressBook(uri, name_winner);

					zfcTarget.get(luid_target).set(ZinFeedItem.ATTR_NAME, name_winner);
					ZinFeed.autoIncrement(zfcTarget.get(luid_target), ZinFeedItem.ATTR_MS);
				}
				else
				{
					this.state.m_logger.warn("Was about to rename an addressbook: " + this.getTbAddressbookNameFromLuid(sourceid_target, luid_target) +
					             " but it didn't exist.  This shouldn't happen.");

					luid_target = null
				}

				break;

			case Suo.DEL | ZinFeedItem.TYPE_CN:
				luid_target = zfiGid.get(sourceid_target);
				l_target    = zfcTarget.get(luid_target).get('l');
				uri         = ZimbraAddressBook.getAddressBookUri(this.getTbAddressbookNameFromLuid(sourceid_target, l_target));
				abCard      = ZimbraAddressBook.lookupCard(uri, TBCARD_ATTRIBUTE_LUID, luid_target);

				if (abCard)
				{
					msg += "Card to be deleted: " + ZimbraAddressBook.nsIAbCardToPrintable(abCard);

					var cardsToBeDeletedArray = Components.classes["@mozilla.org/supports-array;1"].createInstance().
					                                   QueryInterface(Components.interfaces.nsISupportsArray);
					cardsToBeDeletedArray.AppendElement(abCard);

					ZimbraAddressBook.deleteCards(uri, cardsToBeDeletedArray);

					zfcTarget.get(luid_target).set(ZinFeedItem.ATTR_DEL, 1);
				}
				else
				{
					this.state.m_logger.warn("Can't find card to delete in the addressbook: luid: "+ luid_target + " - this shouldn't happen.");

					luid_target = null;
				}

				break;

			case Suo.DEL | ZinFeedItem.TYPE_FL:
				luid_target = zfiGid.get(sourceid_target);
				uri         = ZimbraAddressBook.getAddressBookUri(this.getTbAddressbookNameFromLuid(sourceid_target, luid_target));

				if (uri)
				{
					msg += "Addressbook to be deleted: name: " + zfcTarget.get(luid_target).get(ZinFeedItem.ATTR_NAME) + " uri: " + uri;

					ZimbraAddressBook.deleteAddressBook(uri);
					zfcTarget.get(luid_target).set(ZinFeedItem.ATTR_DEL, 1);
				}
				else
				{
					this.state.m_logger.warn("Can't find addressbook to delete in the addressbook: luid: "+ luid_target + " - this shouldn't happen.");

					luid_target = null;
				}

				break;

			default:
				zinAssert(false);
		}

		if (luid_target)
			SyncFsm.setLsoToGid(zfiGid, zfcTarget.get(luid_target));

		this.state.m_logger.debug("entryActionUpdateTb: " + msg);
	}

	continuation('evNext');
}

// case Suo.ADD:
//  contact:
//   <CreateContactRequest><cn l="7"><a n="company"></a><a n="email">o-1-first.o-1-last@example.com</a><a n="fileAs">1</a></cn>
//   <CreateContactResponse><cn md="1169688921" l="7" id="562" rev="2712" ... />
// folder:
//   <CreateFolderRequest><folder name="ab-1" l="482" view="contact" fie="1"/>
//   <CreateFolderResponse><folder view="contact" l="482" name="ab-1" id="630"/>
// case Suo.MOD:
// contact:
//	change of content:
//    <ModifyContactRequest replace="1" force="1"><cn id="600"><a n="email">blah@example.com</a><a n="fileAs">1</a></cn>
//    <ModifyContactResponse><cn md="1168231780" fileAsStr="blah-1, blah-f" l="481" id="600" rev="3032"/>
//	move only:
//    <ContactActionRequest><action id="348" op="move" l="482"/>
//    <ContactActionResponse><action op="move" id="348"/>
// folder:
//	rename:
//    <FolderActionRequest><action id="631" op="move" l="1"/>
//    <FolderActionResponse><action op="move" id="631"/>
// case Suo.DEL:
// contact: same as Suo.MOD with l=3
// folder:  same as Suo.MOD with l=3, but on response we also remove pending deletes for contained contacts
//
// note that we have no way of distinguishing between
// 1. thunderbird addressbook was deleted along with all it's contacts
// 2. a contact was deleted, then the enclosing folder
// so if we just processed the Suo operations one after another, we'd move the folder into trash,
// then subsequently move the contacts out of the folder (in the Trash) into the Trash, thereby
// losing the association between contacts and the enclosing folder
// Or we could optimise it - so that after a succesful folder move of a folder into trash, 
// we look forward through pending operations, removing those operations that are deletes of contacts in that folder.

// Notes:
// 1. this.state.updateZmPackage maintains state across the soap request + response so that
//    the corresponding suo can be deleted out of aSuo
//    members are: .sourceid  .bucket  .indexSuo
// 2. SORT_ORDER
//    the sort order for zimbra is a bit different from thunderbird.  With zimbra, we delete folders first, because
//    on successful deletion of a folder, pending delete operations on that folder's contacts are removed on the
//    assumption that they weren't deleted individually but were deleted consequential to the deletion of the Tb AddressBook
//    (even though we have no way of knowing one way or the other)
//

SyncFsm.prototype.entryActionUpdateZm = function(state, event, continuation)
{
	var SORT_ORDER = [ Suo.DEL | ZinFeedItem.TYPE_FL, Suo.DEL | ZinFeedItem.TYPE_CN, 
	                   Suo.MOD | ZinFeedItem.TYPE_FL, Suo.MOD | ZinFeedItem.TYPE_CN,
	                   Suo.ADD | ZinFeedItem.TYPE_FL, Suo.ADD | ZinFeedItem.TYPE_CN ];
	                 
	var soapMethod;
	var soapArg = new Object();
	var bucket  = null;
	var msg = "";
	var indexSuo = null;
	var sourceid, sourceid_winner, sourceid_target, uri, zfcWinner, zfcWinner, zfiWinner, l_gid, l_winner, l_target, name_winner, type;
	var properties;

	for (sourceid in this.state.sources)
		if (this.state.sources[sourceid]['format'] == FORMAT_ZM)
			for (var i = 0; i < SORT_ORDER.length && !bucket; i++)
				if (isPropertyPresent(this.state.aSuo[sourceid], SORT_ORDER[i]))
					for (indexSuo in this.state.aSuo[sourceid][SORT_ORDER[i]])
	{
		this.state.m_logger.debug("entryActionUpdateZm: " +
				" opcode: " + Suo.opcodeAsString(SORT_ORDER[i] & Suo.MASK) +
				" type: "   + ZinFeedItem.typeAsString(SORT_ORDER[i] & ZinFeedItem.TYPE_MASK) );

		this.state.m_logger.debug("entryActionUpdateZm: suo[" + indexSuo + "] ==  " + this.state.aSuo[sourceid][SORT_ORDER[i]][indexSuo].toString());

		suo             = this.state.aSuo[sourceid][SORT_ORDER[i]][indexSuo];
		sourceid_winner = suo.sourceid_winner;
		sourceid_target = suo.sourceid_target;
		format_winner   = this.state.sources[sourceid_winner]['format'];
		luid_winner     = this.state.zfcGid.get(suo.gid).get(suo.sourceid_winner);
		zfcWinner       = this.state.sources[suo.sourceid_winner]['zfcLuid'];
		zfcTarget       = this.state.sources[suo.sourceid_target]['zfcLuid'];
		zfiWinner       = zfcWinner.get(luid_winner);
		l_winner        = zfiWinner.get('l');

		switch(SORT_ORDER[i])
		{
			case Suo.ADD | ZinFeedItem.TYPE_FL:
				name_winner = ZinContactConverter.instance().convertFolderName(format_winner, FORMAT_ZM, zfiWinner.get(ZinFeedItem.ATTR_NAME));
				soapMethod  = "CreateFolder";
				soapArg     = newObject(ZinFeedItem.ATTR_NAME, name_winner, 'l', l_winner);
				bucket      = SORT_ORDER[i];
				msg        += " about to add folder name: " + name_winner + " l: " + l_winner;
				break;

			case Suo.ADD | ZinFeedItem.TYPE_CN:
				l_gid      = this.state.aReverseGid[sourceid_winner][l_winner];
				l_target   = this.state.zfcGid.get(l_gid).get(sourceid_target);
				properties = this.getContactFromLuid(sourceid_winner, luid_winner, FORMAT_ZM);
				soapMethod = "CreateContact";
				soapArg    = newObject('properties', properties, 'l', l_target);
				bucket     = SORT_ORDER[i];
				msg       += " about to add contact: " + properties;
				break;

			case Suo.MOD | ZinFeedItem.TYPE_FL:
				luid_target = this.state.zfcGid.get(suo.gid).get(sourceid_target);
				name_winner = ZinContactConverter.instance().convertFolderName(format_winner, FORMAT_ZM, zfiWinner.get(ZinFeedItem.ATTR_NAME));
				soapMethod  = "FolderAction";
				soapArg     = newObject('id', luid_target, 'op', 'update', ZinFeedItem.ATTR_NAME, name_winner);
				bucket      = SORT_ORDER[i];
				msg        += " about to rename folder: ";
				break;

			case Suo.MOD | ZinFeedItem.TYPE_CN:
				luid_target = this.state.zfcGid.get(suo.gid).get(sourceid_target);
				l_gid       = this.state.aReverseGid[sourceid_winner][l_winner];
				l_target    = this.state.zfcGid.get(l_gid).get(sourceid_target);
				msg        += " about to modify contact: ";
				soapMethod  = null;

				if (this.state.sources[sourceid_winner]['format'] == FORMAT_TB) // always a content update 
					soapMethod = "ModifyContact";
				else
				{
					// look at the pre-update zfi:
					// if rev was bumped ==> content update  ==> ModifyContactRequest ==> load content from zc
					// if ms  was bumped ==> attributes only ==> ContactActionRequest ==> load content from zc
					//
					var zfi = this.state.zfcPreUpdateWinners.get(suo.gid);
					var lso = new Lso(zfi.get(ZinFeedItem.ATTR_LS));

					soapMethod = (zfi.get(ZinFeedItem.ATTR_MD) > lso.get(ZinFeedItem.ATTR_MD)) ? "ModifyContact" : "ContactAction";
				}

				if (soapMethod == "ModifyContact")
				{
					properties = this.getContactFromLuid(sourceid_winner, luid_winner, FORMAT_ZM);
					soapArg    = newObject('id', luid_target, 'properties', properties, 'l', l_target);
					bucket     = SORT_ORDER[i];
				}
				else if (soapMethod == "ContactAction")
				{
					soapArg    = newObject('id', luid_target, 'op', 'move', 'l', l_target);
					bucket     = SORT_ORDER[i];
				}
				else
					zinAssert(false);
				break;

			case Suo.DEL | ZinFeedItem.TYPE_FL:
				luid_target = this.state.zfcGid.get(suo.gid).get(sourceid_target);
				name_winner = ZinContactConverter.instance().convertFolderName(format_winner, FORMAT_ZM, zfiWinner.get(ZinFeedItem.ATTR_NAME));
				soapMethod  = "FolderAction";
				bucket      = SORT_ORDER[i];
				msg        += " about to move folder to trash: " + name_winner;

				if (this.isFolderPresentInSource(sourceid_target, ZIMBRA_ID_TRASH, name_winner))
				{
					var d = new Date(); // with this new name, the "move to trash" has a fighting change of success!
					// would prefer an iso8601 date but zimbra doesnt allow folder names to contain colons
					var newname = "/Trash/" + name_winner + "-" + hyphenate("-", d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) + 
	        		                                       "-" + hyphenate("-", d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());

					msg += " - avoiding name clash in Trash by renaming this folder to: " + newname;

					// with op=update, the server does the move before the rename so still fails because of folder name conflict in Trash
					// soapArg     = newObject('id', luid_target, 'op', 'update', ZinFeedItem.ATTR_NAME, newname, 'l', ZIMBRA_ID_TRASH);
					soapArg     = newObject('id', luid_target, 'op', 'rename', ZinFeedItem.ATTR_NAME, newname);
				}
				else
					soapArg     = newObject('id', luid_target, 'op', 'move', 'l', ZIMBRA_ID_TRASH);
				break;

			case Suo.DEL | ZinFeedItem.TYPE_CN:
				luid_target = this.state.zfcGid.get(suo.gid).get(sourceid_target);
				type        = SORT_ORDER[i] & ZinFeedItem.TYPE_MASK;
				soapMethod  = "ContactAction";
				soapArg     = newObject('id', luid_target, 'op', 'move', 'l', ZIMBRA_ID_TRASH);
				bucket      = SORT_ORDER[i];
				msg        += " about to move contact to trash.";
				break;

			default:
				zinAssert(false);
		}

		if (bucket)
			break;
	}

	this.state.m_logger.debug("entryActionUpdateZm: " + msg);

	this.state.updateZmPackage = null;

	if (bucket)
	{
		this.state.updateZmPackage = newObject('sourceid', sourceid, 'bucket', bucket, 'indexSuo', indexSuo,
		                                       'soapmethod', soapMethod, 'soaparg', soapArg);

		this.state.m_logger.debug("entryActionUpdateZm: updateZmPackage: " + aToString(this.state.updateZmPackage));

		this.setupSoapCall(state, 'evRepeat', this.state.updateZmPackage.soapmethod, 
		                          this.state.updateZmPackage.soaparg);

		continuation('evSoapRequest');
	}
	else
	{
		this.state.m_soap_state.m_response = null;
		continuation('evNext');
	}
}

SyncFsm.prototype.exitActionUpdateZm = function(state, event)
{
	if (!this.state.m_soap_state.m_response || event == "evCancel")
		return;

	var msg, suo, xpath_query, functor;
	var response = this.state.m_soap_state.m_response;
	var change = new Object();
	var updateZmPackage = this.state.updateZmPackage;
	var msg = "3377: ";

	ZinXpath.setConditional(change, 'token', "/soap:Envelope/soap:Header/z:context/z:change/attribute::token", response, null);

	if (!isPropertyPresent(change, 'token'))
	{
		this.state.m_logger.error("No change token found.  This shouldn't happen.  Ignoring soap response.");

		delete this.state.aSuo[updateZmPackage.sourceid][updateZmPackage.bucket];  // drastic, but it ensures we don't end up in a loop

		return;
	}

	this.state.m_logger.debug("33771: updateZmPackage: " + aToString(updateZmPackage) + " and change.token: " + change.token);

	var functor_create_blah_response = {
		state: this.state,

		run: function(doc, node)
		{
			var attribute = attributesFromNode(node);
			var l    = attribute['l'];
			var id   = attribute['id'];
			var type = updateZmPackage.bucket & ZinFeedItem.TYPE_MASK;

			if (updateZmPackage.soapmethod == "CreateFolder")
				msg += "created: <folder id='" + id + "' l='" + l + "' name='" + attribute['name'] + "'>";
			else if (updateZmPackage.soapmethod == "CreateContact")
				msg += "created: <cn id='" + id +"' l='" + l + "'>";
			else if (updateZmPackage.soapmethod == "ModifyContact")
				msg += "modified: <cn id='" + id + "'>";

			if (!isPropertyPresent(attribute, 'id') || !isPropertyPresent(attribute, 'l'))
				this.state.m_logger.error("<folder> element received seems to be missing an 'id' or 'l' attribute - ignoring: " + aToString(attribute));
			else
			{
				this.state.m_logger.debug("updateZmPackage.indexSuo: " + updateZmPackage.indexSuo);

				suo = this.state.aSuo[updateZmPackage.sourceid][updateZmPackage.bucket][updateZmPackage.indexSuo];

				delete this.state.aSuo[updateZmPackage.sourceid][updateZmPackage.bucket][updateZmPackage.indexSuo];

				var zfiGid = this.state.zfcGid.get(suo.gid);
				zfcTarget = this.state.sources[suo.sourceid_target]['zfcLuid'];
				var zfi;

				if (updateZmPackage.soapmethod == "ModifyContact")
				{
					zfi = zfcTarget.get(id);
					zfi.set(attribute)
					zfi.set(ZinFeedItem.ATTR_MS, change.token);
					SyncFsm.setLsoToGid(zfiGid, zfi);
					msg += " - updated luid and gid"; 
				}
				else
				{
					zfi = new ZinFeedItem(type, attribute);
					zfi.set(ZinFeedItem.ATTR_MS, change.token);
					SyncFsm.setLsoToGid(zfiGid, zfi);

					zfcTarget.set(zfi);

					zfiGid.set(suo.sourceid_target, id);
					this.state.aReverseGid[suo.sourceid_target][id] = suo.gid;
					msg += " - added luid and gid"; 
				}

			}
		}
	};

	var functor_action_response = {
		state: this.state,

		run: function(doc, node)
		{
			var attribute = attributesFromNode(node);
			var id   = attribute['id'];
			var type = updateZmPackage.bucket & ZinFeedItem.TYPE_MASK;

			msg += " recieved: <action id='" + id + "'>";

			if (!isPropertyPresent(attribute, 'id'))
				this.state.m_logger.error("<action> element received seems to be missing an 'id' attribute - ignoring: " + aToString(attribute));
			else
			{
				suo = this.state.aSuo[updateZmPackage.sourceid][updateZmPackage.bucket][updateZmPackage.indexSuo];

				delete this.state.aSuo[updateZmPackage.sourceid][updateZmPackage.bucket][updateZmPackage.indexSuo];

				var zfcTarget   = this.state.sources[suo.sourceid_target]['zfcLuid'];
				var luid_target = this.state.zfcGid.get(suo.gid).get(suo.sourceid_target);
				var zfiTarget   = zfcTarget.get(luid_target);

				if (updateZmPackage.bucket == (Suo.DEL | ZinFeedItem.TYPE_FL))
					zfiTarget.set('l', ZIMBRA_ID_TRASH);
				else
					zfiTarget.set(updateZmPackage.soaparg);

				zfiTarget.set(ZinFeedItem.ATTR_MS, change.token);
				SyncFsm.setLsoToGid(this.state.zfcGid.get(suo.gid), zfiTarget);

				if (updateZmPackage.bucket == Suo.DEL | ZinFeedItem.TYPE_FL)
				{
					// iterate through aSuo, and remove operations that delete child contacts of this folder (now in Trash)
					//
					var aSuoDelContacts = this.state.aSuo[suo.sourceid_target][Suo.DEL | ZinFeedItem.TYPE_CN];

					for (var indexSuo in aSuoDelContacts)
					{
						suo         = aSuoDelContacts[indexSuo];
						luid_target = this.state.zfcGid.get(suo.gid).get(suo.sourceid_target);
						l_target    = zfcTarget.get(luid_target).get("l");

						if (id == l_target)
						{
							msg += " - removing operation to delete child contact: " + indexSuo;
							delete aSuoDelContacts[indexSuo]; // no need to update maps - the contacts haven't changed
						}
					}
				}

				msg += " - luid map updated - new zfi: " + zfcTarget.get(luid_target);
			}
		}
	};

	switch(updateZmPackage.bucket)
	{
		case Suo.ADD | ZinFeedItem.TYPE_FL:
			xpath_query = "/soap:Envelope/soap:Body/zm:CreateFolderResponse/zm:folder";
			functor = functor_create_blah_response;
			break;
		case Suo.ADD | ZinFeedItem.TYPE_CN:
			xpath_query = "/soap:Envelope/soap:Body/zm:CreateContactResponse/zm:cn";
			functor = functor_create_blah_response;
			break;
		case Suo.MOD | ZinFeedItem.TYPE_FL:
			xpath_query = "/soap:Envelope/soap:Body/zm:FolderActionResponse/zm:action";
			functor = functor_action_response;
			break;
		case Suo.MOD | ZinFeedItem.TYPE_CN:
			if (updateZmPackage.soapmethod == "ModifyContact")
			{
				xpath_query = "/soap:Envelope/soap:Body/zm:ModifyContactResponse/zm:cn";
				functor = functor_create_blah_response;
			}
			else if (updateZmPackage.soapmethod == "ContactAction")
			{
				xpath_query = "/soap:Envelope/soap:Body/zm:ContactActionResponse/zm:action";
				functor = functor_action_response;
			}
			else
				zinAssert(false);
			break;
		case Suo.DEL | ZinFeedItem.TYPE_FL:
			xpath_query = "/soap:Envelope/soap:Body/zm:FolderActionResponse/zm:action";
			functor = functor_action_response;
			break;
		case Suo.DEL | ZinFeedItem.TYPE_CN:
			xpath_query = "/soap:Envelope/soap:Body/zm:ContactActionResponse/zm:action";
			functor = functor_action_response;
			break;
		default:
			zinAssert(false);
	}

	ZinXpath.runFunctor(functor, xpath_query, this.state.m_soap_state.m_response);

	this.state.m_logger.debug(msg);

	if (aToLength(this.state.aSuo[updateZmPackage.sourceid][updateZmPackage.bucket]) == 0)
	{
		delete this.state.aSuo[updateZmPackage.sourceid][updateZmPackage.bucket];  // delete empty buckets
		this.state.m_logger.debug("33771: deleted aSuo sourceid: " + sourceid + " bucket: " + updateZmPackage.bucket);
	}
}

SyncFsm.prototype.getContactFromLuid = function(sourceid, luid, format_to)
{
	var zfc = this.state.sources[sourceid]['zfcLuid'];
	var zfi = zfc.get(luid);
	var l   = zfi.get('l');
	var ret = null;

	if (this.state.sources[sourceid]['format'] == FORMAT_TB)
	{
		var uri    = ZimbraAddressBook.getAddressBookUri(this.getTbAddressbookNameFromLuid(sourceid, l));
		var abCard = ZimbraAddressBook.lookupCard(uri, TBCARD_ATTRIBUTE_LUID, luid);

		if (abCard)
		{
			ret = ZimbraAddressBook.getCardProperties(abCard);
			ret = ZinContactConverter.instance().convert(format_to, FORMAT_TB, ret);
		}
		else
			this.state.m_logger.warn("can't find contact for to sourceid: " + sourceid + " and luid: " + luid + " in thunderbird addressbook uri: " + uri + " - this shouldn't happen.");
	}
	else
	{
		var zc = this.state.aSyncContact[luid_winner]; // the ZimbraContact object that arrived via GetContactResponse
		ret = ZinContactConverter.instance().convert(format_to, FORMAT_ZM, zc.element);
	}

	return ret;
}

SyncFsm.prototype.entryActionUpdateCleanup = function(state, event, continuation)
{
	var gid;
	var aGidsToDelete = new Array();

	// this.state.m_logger.debug("998899: after UpdateZm, zfcZm: " + this.state.sources[this.state.sourceid_zm]['zfcLuid'].toString());
	// this.state.m_logger.debug("998899: after UpdateZm, zfcGid: " + this.state.zfcGid.toString());

	// 1. delete the gid when all the mapitems source maps have a ZinFeedItem.ATTR_DEL attribute
	//    delete the mapping between a gid and an luid when the luid is not of interest
	
	var functor_foreach_luid = {
		state: this.state,
		run: function(zfi)
		{
			var luid = zfi.id();
			var gid = isPropertyPresent(this.state.aReverseGid[sourceid], luid) ? this.state.aReverseGid[sourceid][luid] : null;
			var zfc = this.state.sources[sourceid]['zfcLuid'];

			// delete luids and their link to the gid when ZinFeedItem.ATTR_DEL is set
			//
			if (zfi.isPresent(ZinFeedItem.ATTR_DEL))
			{
				zfc.del(luid);
				this.state.m_logger.debug("2332 - cleanup: sourceid: " + sourceid + " - deleted luid: " + luid);

				if (gid)
				{
					this.state.zfcGid.get(gid).del(sourceid);
					delete this.state.aReverseGid[sourceid][luid];

					this.state.m_logger.debug("2332 - cleanup: gid: " + gid + " - deleted reference to sourceid: " + sourceid);
				}
			}
			else if (this.state.sources[sourceid]['format'] == FORMAT_ZM && gid && !SyncFsm.isOfInterest(zfc, zfi.id()))
			{
				// for zimbra luids, delete the link to the gid if the luid is no longer of interest
				//
				this.state.zfcGid.get(gid).del(sourceid);
				delete this.state.aReverseGid[sourceid][luid];
				this.state.m_logger.debug("2332 - cleanup: gid: " + gid + " - deleted reference to sourceid: " + sourceid + " as the item is no longer of interest");
			}

			return true;
		}
	};

	for (sourceid in this.state.sources)
		this.state.sources[sourceid]['zfcLuid'].forEach(functor_foreach_luid, SyncFsm.forEachFlavour(this.state.sources[sourceid]['format']));

	var functor_count_luids_in_gid = {
		count: 0,
		run: function(sourceid, luid)
		{
			this.count++;

			return true;
		}
	};

	var functor_foreach_gid = {
		state: this.state,
		run: function(zfi)
		{
			functor_count_luids_in_gid.count = 0;

			zfi.forEach(functor_count_luids_in_gid, ZinFeedItem.ITER_SOURCEID);

			this.state.m_logger.debug("2332 - cleanup: zfi: " + zfi.toString() + " count: " + functor_count_luids_in_gid.count);

			if (functor_count_luids_in_gid.count == 0)
			{
				this.state.m_logger.debug("2332 - cleanup: gid: " + zfi.id() + " had no links to luids - deleted.");
				this.state.zfcGid.del(zfi.id());
			}

			return true;
		}
	};

	this.state.zfcGid.forEach(functor_foreach_gid, ZinFeedCollection.ITER_UNRESERVED);

	var nextEvent = 'evNext';

	if (!this.isConsistentDataStore()) // if this fails, it indicates a bug in our code...
		nextEvent = 'evLackIntegrity';

	continuation(nextEvent);
}

SyncFsm.prototype.entryActionCommit = function(state, event, continuation)
{
	this.state.zfcLastSync.get(this.state.sourceid_zm).set('SyncToken', this.state.SyncToken);
	this.state.zfcLastSync.get(this.state.sourceid_zm).set('soapURL', this.state.sources[this.state.sourceid_zm]['soapURL']);
	this.state.zfcLastSync.get(this.state.sourceid_zm).set('username', this.state.sources[this.state.sourceid_zm]['username']);
	this.state.zfcLastSync.save();

	this.state.zfcGid.save();

	for (var i in this.state.sources)
		this.state.sources[i]['zfcLuid'].save();

	continuation('evNext');
}

SyncFsm.prototype.entryActionFinal = function(state, event, continuation)
{
	// do nothing
}

SyncFsm.prototype.suoOpcode = function(suo)
{
	var type = this.feedItemTypeFromGid(suo.gid, suo.sourceid_winner);
	return (type | suo.opcode);
}

// if there's no ver in the gid, add it and reset the zfi ls
// else if the zfi ls doesn't match either the zfi or the gid attributes, bump the gid's ver and reset the zfi's ls
// otherwise do nothing
//
SyncFsm.prototype.resetLsoVer = function(gid, zfi)
{
	var lsoFromZfiAttributes = new Lso(zfi);
	var lsoFromLsAttribute   = zfi.isPresent(ZinFeedItem.ATTR_LS) ? new Lso(zfi.get(ZinFeedItem.ATTR_LS)) : null;
	var zfiGid = this.state.zfcGid.get(gid);
	var ver    = null;

	if (!zfiGid.isPresent(ZinFeedItem.ATTR_VER))
	{
		ver = 1;
		zfiGid.set(ZinFeedItem.ATTR_VER, ver);
	}
	else if (lsoFromLsAttribute == null ||
	        lsoFromLsAttribute.get(ZinFeedItem.ATTR_VER) != zfiGid.get(ZinFeedItem.ATTR_VER) ||
			lsoFromLsAttribute.compare(zfi) != 0 )
	{
		ZinFeed.autoIncrement(this.state.zfcGid.get(gid), ZinFeedItem.ATTR_VER);
		ver = zfiGid.get(ZinFeedItem.ATTR_VER);
	}

	if (ver)
	{
		lsoFromZfiAttributes.set(ZinFeedItem.ATTR_VER, ver);
		zfi.set(ZinFeedItem.ATTR_LS, lsoFromZfiAttributes.toString());

		this.state.m_logger.debug("9664: gid ver set to: " + ver + " and zfi: " + zfi.toString());
	}

}

SyncFsm.prototype.isFolderPresentInSource = function(sourceid, luid_parent, name)
{
	var isPresent = false;

	var functor = {
		run: function(zfi)
		{
			if (zfi.get('l') == luid_parent && zfi.isPresent(ZinFeedItem.ATTR_NAME) && zfi.get(ZinFeedItem.ATTR_NAME) == name)
				isPresent = true;

			return !isPresent;
		}
	};

	this.state.sources[sourceid]['zfcLuid'].forEach(functor, SyncFsm.forEachFlavour(this.state.sources[sourceid]['format']));

	return isPresent;
}

SyncFsm.prototype.feedItemTypeFromGid = function(gid, sourceid)
{
	var luid = this.state.zfcGid.get(gid).get(sourceid);
	return this.state.sources[sourceid]['zfcLuid'].get(luid).type();
}

// TODO - assert that users can't add a "zindus/Trash" or "zindus/GAL" folder
//

SyncFsm.prototype.getTbAddressbookNameFromLuid = function(sourceid, luid)
{
	var zfc    = this.state.sources[sourceid]['zfcLuid'];
	var format = this.state.sources[sourceid]['format'];

	if (!zfc.isPresent(luid))
		this.state.m_logger.debug("getTbAddressbookNameFromLuid: sourceid: " + sourceid + " luid: " + luid);

	zinAssert(zfc.isPresent(luid));

	var name = zfc.get(luid).get(ZinFeedItem.ATTR_NAME);
	var ret  = ZinContactConverter.instance().convertFolderName(format, FORMAT_TB, name);

	return ret;
}

SyncFsm.prototype.isLsoVerMatch = function(gid, zfi)
{
	var ret = false;

	if (zfi.isPresent(ZinFeedItem.ATTR_LS))
	{
		var lso = new Lso(zfi.get(ZinFeedItem.ATTR_LS));

		if (lso.get(ZinFeedItem.ATTR_VER) == this.state.zfcGid.get(gid).get(ZinFeedItem.ATTR_VER))
		{
			var res = lso.compare(zfi);

			ret = (res == 0);
		}
	}

	return ret;
}

SyncFsm.removeZfcs = function()
{
	// One might imagine that the fsm timer might run during this but it can't because the code below doesn't release control

	gLogger.debug("reset: ");

	var file;
	var directory = Filesystem.getDirectory(Filesystem.DIRECTORY_DATA);

	// remove files in the data directory
	//
	if (directory.exists() && directory.isDirectory())
	{
		var iter = directory.directoryEntries;
 
		while (iter.hasMoreElements())
		{
			file = iter.getNext().QueryInterface(Components.interfaces.nsIFile);

			file.remove(false);
		}
	}
}

SyncFsm.removeLogfile = function()
{
	// remove the logfile
	//
	file = Filesystem.getDirectory(Filesystem.DIRECTORY_LOG);
	file.append(LOGFILE_NAME);

	if (file.exists() && !file.isDirectory())
		file.remove(false);
}

SyncFsm.setLsoToGid = function(zfiGid, zfiTarget)
{
	var lso = new Lso(zfiTarget);
	var ver = zfiGid.get(ZinFeedItem.ATTR_VER);

	lso.set(ZinFeedItem.ATTR_VER, ver);

	zfiTarget.set(ZinFeedItem.ATTR_LS, lso.toString());
}

SyncFsm.forEachFlavour = function(format)
{
	return (format == FORMAT_ZM) ? ZinFeedCollection.ITER_ALL : ZinFeedCollection.ITER_UNRESERVED;
}

// note: this function takes a variable number of arguments following the "method" parameter
// Function.length below returns the number of formal arguments
//
SyncFsm.prototype.setupSoapCall = function(state, eventOnResponse, method)
{
	this.state.m_logger.debug("setupSoapCall: state: " + state + " eventOnResponse: " + eventOnResponse + " method: " + method);

	var args = new Array();
	for (var i = SyncFsm.prototype.setupSoapCall.length; i < arguments.length; i++)
		args.push(arguments[i]);

	this.state.m_soap_state = new SoapState();
	this.state.m_soap_state.m_method = method;
	this.state.m_soap_state.m_zsd.context(this.state.authToken, this.state.sessionId);
	this.state.m_soap_state.m_zsd[method].apply(this.state.m_soap_state.m_zsd, args);

	this.fsm.transitions['stSoapResponse']['evNext'] = this.fsm.transitions[state][eventOnResponse];

	if (this.fsm.aActionExit[state])
		this.fsm.aActionExit['stSoapResponse'] = this.fsm.aActionExit[state];

	this.state.m_logger.debug("setupSoapCall: soap final state: " + this.fsm.transitions[state][eventOnResponse]);
}

SyncFsm.prototype.entryActionSoapRequest = function(state, event, continuation)
{
	var soapCall = new SOAPCall();
	var context  = this;
	var soapstate = this.state.m_soap_state;

	zinAssert(!soapstate.is_cancelled);
	zinAssert(soapstate.isPreResponse());
	zinAssert(!soapstate.isPostResponse());
	zinAssert(soapstate.isStateConsistent());

	soapCall.transportURI = this.state.soapURL;
	soapCall.message      = this.state.m_soap_state.m_zsd.doc;

	this.state.m_logger.debug("soap request: " + xmlDocumentToString(soapCall.message));


	// if soapCall is passed bad args (eg if transportURI is an email address), asyncInvoke() doesn't return!
	// the cases I've found are handled during the integrity checking at the start of the fsm.
	//
	this.state.m_soap_state.m_callcompletion = soapCall.asyncInvoke(
	        function (response, call, error)
			{
				context.handleAsyncResponse(response, call, error, continuation, context);
			}
		);
	// this.state.m_logger.debug("m_callcompletion: evaluates to: " + (this.state.m_soap_state.m_callcompletion ? "true" : "false"));
	// this.state.m_logger.debug("m_callcompletion.isComplete: " + this.state.m_soap_state.m_callcompletion.isComplete);
}

// Note that "this" in this method could be anything - the mozilla SOAP API decides.
// That's why we call continuation() here, so that the code that processes the response can refer to "this", rather than "context".
//
SyncFsm.prototype.handleAsyncResponse = function (response, call, error, continuation, context)
{
	var ret = false;
	var soapstate = context.state.m_soap_state;

	zinAssert(!soapstate.is_cancelled); // we shouldn't be here because we called abort() on the m_callcompletion object!

	soapstate.m_service_code = error;

	// four scenarios here:
	//   a) service failure
	//      - documentation says that this is reported by a non-zero value for the error argument
	//      - I also notice that when no web server is listening on the targetURI port, 
	//        this function is called with error == 0 but response == null.  This seems like a bug...
	//   b) soap fault and response.fault is non-null
	//      - there is some sub-scenario here whereby response.fault.detail might be missing, possibly because of a namespace muddle
	//      - the zimbra fault seems to stuff things up - need to isolate this test case better
	//   c) soap fault and response.fault is null and error = 0 but response is a soap:Fault element.
	//      This is a bug - either in zimbra's (document-style) response or mozilla (should look into this further)
	//   d) <BlahResponse> document ==> success!
	//

	if (response == null && error == 0)
	{
		// this is a workaround for (what I think is) a mozilla bug
		// whereby if the web server isn't listening to the target URI,
		// the callback gets executed with a null response and error code zero.
		// here, we turn that into a non-zero error code.
		//
		soapstate.m_service_code = SOAP_REQUEST_FAILED;
		context.state.m_logger.debug("handleAsyncResponse: soap service failure - error code set by fiat: " + soapstate.m_service_code);
	}
	else if (error != 0)
	{ 
		context.state.m_logger.debug("handleAsyncResponse: soap service failure - error code is " + error);
	}
	else 
	{
		context.state.m_logger.debug("handleAsyncResponse: response.version is " + response.version);

		if (response.fault != null)
		{ 
			soapstate.faultLoadFromSoapFault(response.fault);

			if (!soapstate.m_faultstring)
				soapstate.faultLoadFromXml(response.fault.element);
		}
		else
		{
			var nodelist = response.message.getElementsByTagNameNS(ZimbraSoapDocument.NS_SOAP_ENVELOPE, "Fault");

			if (nodelist.length > 0)
			{
				soapstate.faultLoadFromXml(response.message);
			}
			else
			{
				soapstate.m_response = response.message;

				context.state.m_logger.debug("handleAsyncResponse: response is " + xmlDocumentToString(response.message));
			}
		}
	}

	var msg;
	if (soapstate.m_service_code != 0)
		msg = "soap service failure - m_service_code is " + soapstate.m_service_code;
	else if (soapstate.m_fault_element_xml)
		msg = "soap fault: service code " + soapstate.m_service_code;

	if (msg)
	{
		msg += " fault xml: " + soapstate.m_fault_element_xml;
		context.state.m_logger.debug("handleAsyncResponse: " + msg);
	}

	continuation('evNext');

	return true;
}

SyncFsm.prototype.entryActionSoapResponse = function(state, event, continuation)
{
	var soapstate = this.state.m_soap_state;
	var nextEvent = null;

	this.state.m_logger.debug("entryActionSoapResponse: m_method: " + soapstate.m_method);

	zinAssert(soapstate.isPostResponse());
	zinAssert(soapstate.isStateConsistent());

	// For method == "CheckLicense", the fault varies depending on open-source vs non-open-source server:
	// soapstate.m_faultcode == "service.UNKNOWN_DOCUMENT" or <soap:faultcode>soap:Client</soap:faultcode>
	//

	if (soapstate.m_method == "CheckLicense" && soapstate.m_fault_element_xml)
		nextEvent = 'evNext';
	else if (soapstate.m_response)
	{
		var node = ZinXpath.getSingleValue(ZinXpath.queryFromMethod(soapstate.m_method), soapstate.m_response, soapstate.m_response);

		if (node)
			nextEvent = 'evNext'; // we found a BlahResponse element - all is well
		else
		{
			nextEvent = 'evCancel';
			this.state.m_logger.error("soap response isn't a fault and doesn't match our request - about to cancel");
		}
	}
	else 
	{
		var msg = "soap error - ";  // note that we didn't say "fault" here - it could be a sending/service error

		if (soapstate.m_service_code != 0 && soapstate.m_service_code != null)
			msg += "m_service_code == " + soapstate.m_service_code;
		else if (soapstate.m_fault_element_xml)
			msg += "fault fields as shown: " + soapstate.toString();
		else
			zinAssert(false);

		this.state.m_logger.debug(msg);

		nextEvent = 'evCancel';
	}

	this.state.m_logger.debug("entryActionSoapResponse: calls continuation with: " + nextEvent);

	continuation(nextEvent); // the state that this corresponds to in the transitions table was set by setupSoapCall()
}

SyncFsm.prototype.exitActionSoapResponse = function(state, event)
{
	// this method's entry in the aActionExit table may be overwritten by setupSoapCall
	// otherwise, do nothing...
}

function SoapState()
{
	this.m_zsd               = new ZimbraSoapDocument();
	this.m_method            = null;  // the prefix of the soap method, eg: "Auth" or "GetContacts"
	this.m_callcompletion    = null;  // the object returned by soapCall.asyncInvoke()

	this.m_response          = null;  // SOAPResponse.message - the xml soap message response, assuming all was well
	this.m_service_code      = null;  // 
	this.m_faultcode         = null;  // These are derived from the soap fault element
	this.m_fault_element_xml = null;  // the soap:Fault element as string xml
	this.m_fault_detail      = null;
	this.m_faultstring       = null;
	this.is_cancelled        = false;

	zinAssert(this.isStateConsistent());
	zinAssert(this.isPreResponse());
	zinAssert(!this.is_cancelled);
	zinAssert(!this.isPostResponse());
}

SoapState.prototype.failCode = function()
{
	var ret;

	if (this.is_cancelled)                     ret = SyncFsmExitStatus.FailOnCancel;
	else if (!this.m_callcompletion)           ret = SyncFsmExitStatus.FailOnUnknown;  // pre-request:       not a failure
	else if (this.m_response != null)          ret = SyncFsmExitStatus.FailOnUnknown;  // response recieved: not a failure
	else if (this.m_service_code != 0)         ret = SyncFsmExitStatus.FailOnService;
	else if (this.m_fault_element_xml != null) ret = SyncFsmExitStatus.FailOnFault;
	else                                       ret = SyncFsmExitStatus.FailOnUnknown;  // this really is unknown

	return ret;
}

SoapState.prototype.isStateConsistent = function()
{
	return this.isPreResponse() || this.isPostResponse();
}

SoapState.prototype.isPostResponse = function()
{
	var c = 0;

	if (this.m_response != null)                                c++;
	if (this.m_service_code != null && this.m_service_code !=0) c++;
	if (this.m_fault_element_xml != null)                       c++;

	return (c == 1); // exactly one of these three things is true after a response
}

// pre-request would be m_callcompletion == null
//
SoapState.prototype.isPreResponse = function()
{
	return (this.m_response == null) && (this.m_service_code == null) && (this.m_faultcode == null) &&
	       (this.m_fault_element_xml == null) && (this.m_fault_detail == null) && (this.m_faultstring == null);
}

// load from xml - a SOAPResponse.message or SOAPFault.element
//
SoapState.prototype.faultLoadFromXml = function(doc)
{
	var nodelist;
	
	this.m_fault_element_xml = xmlDocumentToString(doc);

	conditionalGetElementByTagNameNS(doc, ZimbraSoapDocument.NS_SOAP_ENVELOPE, "faultstring", this, 'm_faultstring');
	conditionalGetElementByTagNameNS(doc, "urn:zimbra",                        "Trace",       this, 'm_fault_detail');
	conditionalGetElementByTagNameNS(doc, "urn:zimbra",                        "Code",        this, 'm_faultcode');
}

// load from a SOAPFault object - http://www.xulplanet.com/references/objref/SOAPFault.html
//
SoapState.prototype.faultLoadFromSoapFault = function(fault)
{
	if (fault.element)
		this.m_fault_element_xml = xmlDocumentToString(fault.element);
		
	if (fault.faultString)
		this.m_faultstring = fault.faultString;

	if (fault.detail)
		this.m_fault_detail = fault.detail;

	if (fault.faultcode)
		this.m_faultcode = fault.faultcode;
}

SoapState.prototype.toString = function()
{
	var ret = "\n callcompletn = "     + (this.m_callcompletion ? "non-null" : "null") +
	          "\n service code = "     + this.m_service_code +
	          "\n fault code = "       + this.m_faultcode +
	          "\n fault string = "     + this.m_faultstring +
	          "\n fault detail = "     + this.m_fault_detail +
	          "\n fault elementxml = " + this.m_fault_element_xml +
	          "\n response = "         + this.m_response;

	return ret;
}

SoapState.prototype.toHtml = function()
{
	return this.toString().replace(/\n/g, "<html:br>");
}

function AuthOnlyFsm(state) { this.SyncFsm(state); this.setFsm(); }
function TwoWayFsm(state)   { this.SyncFsm(state); this.setFsm(); }

copyPrototype(AuthOnlyFsm, SyncFsm);
copyPrototype(TwoWayFsm,   SyncFsm);

AuthOnlyFsm.prototype.setFsm = function()
{
	this.fsm = SyncFsm.getFsm(this);

	this.fsm.transitions['stAuth']['evNext'] = 'final';
}

TwoWayFsm.prototype.setFsm = function()
{
	this.fsm = SyncFsm.getFsm(this);
}

function SyncFsmState(id_fsm)
{
	this.id_fsm              = id_fsm;
	this.m_logger            = newZinLogger("SyncFsm");
	this.m_soap_state        = null;
	this.zfcLastSync         = null;                    // ZinFeedCollection - maintains state re: last sync (anchors, success/fail)
	this.zfcGid              = null;                    // ZinFeedCollection - map of gid to (sourceid, luid)
	this.zfcPreUpdateWinners = new ZinFeedCollection(); // has the winning zfi's before they are updated to reflect their win (LS unchanged)

	this.authToken           = null;         // Auth
	this.sessionId           = null;
	this.lifetime            = null;
	this.soapURL             = null;         // see setCredentials() -  and may be modified by a <soapURL> response from GetAccountInfo
	this.aReverseGid         = new Object(); // reverse lookups for the gid, ie given (sourceid, luid) find the gid.
	this.isZimbraFeatureGalEnabled = false;     // GetInfo ==> FALSE ==> don't do SyncGalRequest
	this.mapiStatus          = null;         // CheckLicenseStatus
	this.aSyncGalContact     = null;         // SyncGal
	this.mapIdSyncGalContact = null;      
	this.SyncGalToken        = null;
	this.SyncGalTokenChanged = false;
	this.aSyncContact        = new Object(); // each property is a ZimbraContact object returned in GetContactResponse
	this.SyncMd              = null;         // this gives us the time on the server
	this.SyncToken           = null;         
	this.aQueue              = new Object(); // associative array of contact ids - ids added in SyncResponse, deleted in GetContactResponse
	this.aSuo                = null;         // container for source update operations - populated in SyncPrepare
	this.updateZmPackage     = null;         // maintains state between an zimbra server update request and the response

	this.m_preferences  = new MozillaPreferences();
	this.m_bimap_format = new BiMap(
		[FORMAT_TB, FORMAT_ZM],
		['tb',      'zm'     ]);

	this.sources = new Object();
	this.sources[SOURCEID_TB] = new Object();
	this.sources[SOURCEID_ZM] = new Object();

	this.sources[SOURCEID_TB]['format']   = FORMAT_TB;
	this.sources[SOURCEID_TB]['name']     = stringBundleString("sourceThunderbird");

	this.sources[SOURCEID_ZM]['format']   = FORMAT_ZM;
	this.sources[SOURCEID_ZM]['name']     = stringBundleString("sourceServer");

	for (var i in this.sources)
		this.sources[i]['zfcLuid'] = null;  // ZinFeedCollection - updated during sync and persisted at the end

	this.sourceid_tb = SOURCEID_TB;
	this.sourceid_zm = SOURCEID_ZM;
}

SyncFsmState.prototype.setCredentials = function()
{
	if (arguments.length == 3)
	{
		this.sources[SOURCEID_ZM]['soapURL']  = arguments[0];
		this.sources[SOURCEID_ZM]['username'] = arguments[1];
		this.sources[SOURCEID_ZM]['password'] = arguments[2];
	}
	else
	{
		// load credentials from preferences and the password manager
		//
		var prefset = new PrefSet(PrefSet.SERVER,  PrefSet.SERVER_PROPERTIES);
		prefset.load(SOURCEID_ZM);

		[ this.sources[SOURCEID_ZM]['username'],
		  this.sources[SOURCEID_ZM]['soapURL'],
		  this.sources[SOURCEID_ZM]['password'] ] = PrefSetHelper.getUserUrlPw(prefset, PrefSet.SERVER_USERNAME, PrefSet.SERVER_URL);
	}

	this.sources[SOURCEID_ZM]['soapURL'] += "/service/soap/";
}

function AuthOnlyFsmState() { this.SyncFsmState(ZinMaestro.FSM_ID_AUTHONLY); }
function TwoWayFsmState()   { this.SyncFsmState(ZinMaestro.FSM_ID_TWOWAY);   }

copyPrototype(AuthOnlyFsmState, SyncFsmState);
copyPrototype(TwoWayFsmState,   SyncFsmState);

// SyncFsm.prototype.getTwinKeysFromZm(contact, parent_folder_id)  // matches contact against the elements of aSyncContact with an attribute l=parent_folder_id
// SyncFsm.prototype.getTwinKeysFromTb(contact, parent_folder_uri) // matches contact against the contacts in parent_folder_uri
