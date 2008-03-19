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

// An object of this class is updated as a SyncFsm progresses from start to finish.
// It's state includes both percentage complete and per-fsm-state text detail.
//
function SyncFsmObserver()
{
	this.state = null; // SyncFsm.state, used on a read-only basis, set before any update

	this.m_logger = newZinLogger("SyncFsmObserver");

	this.m_exit_status = null;

	this.m_properties = new Object();

	this.set(SyncFsmObserver.OP,       "");
	this.set(SyncFsmObserver.PROG_MAX, 0);
	this.set(SyncFsmObserver.PROG_CNT, 0);
}

SyncFsmObserver.OP                  = 'op'; // eg: server put
SyncFsmObserver.PROG_CNT            = 'pc'; // eg: 3 of
SyncFsmObserver.PROG_MAX            = 'pm'; // eg: 6    (counts progress through an iteration of one or two states)
SyncFsmObserver.PERCENTAGE_COMPLETE = 'pp'; // eg: 70%  (counts how far we are through all observed states)

SyncFsmObserver.prototype.exitStatus = function()
{
	if (arguments.length > 0)
		this.m_exit_status = arguments[0];

	return this.m_exit_status;
}

SyncFsmObserver.prototype.set = function(key, value)
{
	this.m_properties[key] = value;
}

SyncFsmObserver.prototype.get = function(key, value)
{
	return this.m_properties[key];
}

SyncFsmObserver.prototype.progressReportOn = function(stringid)
{
	this.set(SyncFsmObserver.OP, stringBundleString(this.tweakStringId(stringid)) );

	this.set(SyncFsmObserver.PROG_MAX, 0);
}

SyncFsmObserver.prototype.progressReportOnSource = function()
{
	this.set(SyncFsmObserver.OP, this.buildOp(arguments[0], arguments[1]));

	this.set(SyncFsmObserver.PROG_MAX, (arguments.length == 3) ? arguments[2] : 0);
}

SyncFsmObserver.prototype.buildOp = function(sourceid, stringid)
{
	return this.state.sources[sourceid]['name'] + " " + stringBundleString(this.tweakStringId(stringid));
}

SyncFsmObserver.prototype.tweakStringId = function(stringid)
{
	return "zfomProgress" + stringid;
}

SyncFsmObserver.prototype.progressToString = function()
{
	var ret = "";
	
	ret += this.get(SyncFsmObserver.OP);

	if (this.get(SyncFsmObserver.PROG_MAX) > 0)
		ret += " " + this.get(SyncFsmObserver.PROG_CNT) +
		       " " + stringBundleString(this.tweakStringId("Of")) +
		       " " + this.get(SyncFsmObserver.PROG_MAX);

	return ret;
}

SyncFsmObserver.prototype.update = function(fsmstate)
{
	var ret = false;
	var c = 0;
	var a_states = {
		start:            { },
		stAuth:           { count: c++ },
		stLoad:           { count: c++ },
		stLoadTb:         { count: c++ },
		stGetAccountInfo: { count: c++ },
		stSelectSoapUrl:  { count: c++ },
		stGetInfo:        { count: c++ },
		stCheckLicense:   { },
		stSync:           { },
		stSyncResult:     { },
		stGetContact:     { count: c++ },
		stGalConsider:    { },
		stGalSync:        { count: c++ },
		stGalCommit:      { },
		stConverge1:      { count: c++ },
		stConverge2:      { },
		stConverge3:      { },
		stGetContactsDel: { count: c++ },
		stUpdateTb:       { count: c++ },
		stUpdateZm:       { count: c++ },
		stUpdateCleanup:  { count: c++ },
		stSoapRequest:    { },
		stSoapResponse:   { },
		stCommit:         { },
		final:            { count: c++ }
	};

	this.m_logger.debug("update: fsmstate: " + (fsmstate ? fsmstate.toString() : "null"));

	var context = fsmstate.context; // SyncFsm
	this.state = context.state;

	zinAssert(isMatchObjectKeys(a_states, context.fsm.m_transitions));

	if (fsmstate.newstate && isPropertyPresent(a_states[fsmstate.newstate], 'count')) // fsmstate.newstate == null when oldstate == 'final'
	{
		ret = true;

		switch(fsmstate.newstate)
		{
			case 'stAuth':           this.progressReportOnSource(context.state.sourceid_zm, "RemoteAuth");  break;
			case 'stLoad':           this.progressReportOn("Load");                                         break;
			case 'stGetAccountInfo': this.progressReportOnSource(context.state.sourceid_zm, "AccountInfo"); break;
			case 'stGetInfo':          
			case 'stCheckLicense':          
			case 'stSync':          
			case 'stSyncResult':     this.progressReportOnSource(context.state.sourceid_zm, "RemoteSync");  break;
			case 'stGalSync':        
			case 'stGalCommit':      this.progressReportOnSource(context.state.sourceid_zm, "GetGAL");      break;
			case 'stLoadTb':         this.progressReportOnSource(context.state.sourceid_tb, "Load");        break;
			case 'stConverge1':     
			case 'stConverge2':     
			case 'stConverge3':      this.progressReportOn("Converge");                                     break;
			case 'stUpdateTb':       this.progressReportOnSource(context.state.sourceid_tb, "PutOne");      break;
			case 'stUpdateCleanup':  this.progressReportOn("Saving");                                       break;

			case 'stSelectSoapUrl':
				if (context.state.suggestedSoapURL)
				{
					this.progressReportOnSource(context.state.sourceid_zm, "SelectSoapUrl");
					this.set(SyncFsmObserver.OP, this.get(SyncFsmObserver.OP)
					                                   + " " + context.state.suggestedSoapURL
					                                   + "<br/>"
					                                   + stringBundleString(this.tweakStringId("SelectSoapUrl2"))
														);
				}
				else
					ret = false; // no need to update the UI
				break;

			case 'stGetContact':
			case 'stGetContactsDel':
				if (context.state.aContact.length > 0)
				{
					var op = this.buildOp(context.state.sourceid_zm, "GetMany");

					if (this.get(SyncFsmObserver.OP) != op)
					{
						// this.m_logger.debug("4401: op: " + op + " this.get(SyncFsmObserver.OP): " + this.get(SyncFsmObserver.OP));
						this.progressReportOnSource(context.state.sourceid_zm, "GetMany", context.state.aContact.length);
						this.set(SyncFsmObserver.PROG_CNT, 0);
					}

					this.set(SyncFsmObserver.PROG_CNT, this.get(SyncFsmObserver.PROG_CNT) + 1);
				}
				else
					ret = false; // no need to update the UI
				break;

			case 'stUpdateZm':
				var sourceid = null;

				bigloop: for (var x in context.state.sources)
					if (context.state.sources[x]['format'] == FORMAT_ZM)
						for (y in context.state.aSuo[x])
								for (var z in context.state.aSuo[x][y])
								{
									sourceid = x;
									break bigloop;
								}

				if (sourceid)
				{
					var op = this.buildOp(sourceid, "PutMany");

					if (this.get(SyncFsmObserver.OP) != op)
					{
						var cTotal = 0; // aSuo definitely needs an iterator!
						for (var x in context.state.sources)
							if (context.state.sources[x]['format'] == FORMAT_ZM)
								for (y in context.state.aSuo[x])
										for (var z in context.state.aSuo[x][y])
											cTotal++;

						this.progressReportOnSource(sourceid, "PutMany", cTotal);
						this.set(SyncFsmObserver.PROG_CNT, 0);

						// this.m_logger.debug("update: stUpdateZm: this.get(SyncFsmObserver.OP): " + this.get(SyncFsmObserver.OP)
						//                                                                          + " cTotal: " + cTotal);
					}

					this.set(SyncFsmObserver.PROG_CNT, this.get(SyncFsmObserver.PROG_CNT) + 1);
					this.m_logger.debug("4402: PROG_CNT: " + this.get(SyncFsmObserver.PROG_CNT));
				}
				else
				{
					this.progressReportOnSource(context.state.sourceid_zm, "PutOne", cTotal);
				}
				break;

			case 'final':
				if (fsmstate.event == 'evCancel')
					this.progressReportOn("Cancelled");
				else
					this.progressReportOn("Done");

				var es = new SyncFsmExitStatus();

				if (fsmstate.event == 'evCancel')
				{
					es.m_exit_status = 1;

					if (context.state.m_soap_state.isFailed())
					{
						es.failcode(context.state.m_soap_state.failCode());

						if (context.state.m_soap_state.m_faultstring)
							es.m_fail_detail = context.state.m_soap_state.m_faultstring;
						else if (context.state.m_soap_state.m_faultcode)
							es.m_fail_detail = context.state.m_soap_state.m_faultcode;

						es.m_fail_soapmethod = context.state.m_soap_state.m_method;
					}
					else
						es.failcode('FailOnCancel');
				}
				else if (fsmstate.event == 'evLackIntegrity')
				{
					es.m_exit_status = 1;

					if (fsmstate.oldstate == 'start')
						es.failcode(context.state.stopFailCode);
					else if (fsmstate.oldstate == 'stLoad')
						es.failcode('FailOnIntegrityDataStoreIn');
					else if (isInArray(fsmstate.oldstate, [ 'stLoadTb', 'stConverge1', 'stConverge3', 'stUpdateCleanup' ]))
					{
						es.failcode(context.state.stopFailCode);
						es.m_fail_detail = context.state.stopFailDetail;
					}
					else
						es.failcode('FailOnUnknown');
				}
				else if (context.state.id_fsm == ZinMaestro.FSM_ID_AUTHONLY && context.state.authToken)
					es.m_exit_status = 0;
				else if (context.state.id_fsm == ZinMaestro.FSM_ID_TWOWAY && fsmstate.event == 'evNext')
					es.m_exit_status = 0;
				else
					zinAssert(false); // ensure that all cases are covered above

				if (es.m_exit_status != 0)
					es.m_fail_fsmoldstate = fsmstate.oldstate;

				zinAssert(es.failcode() != 'FailOnUnknown');

				for (var i = 0; i < context.state.aConflicts.length; i++)
					this.m_logger.info("conflict: " + context.state.aConflicts[i]);

				es.m_count_conflicts = context.state.aConflicts.length;

				this.m_logger.debug("exit status: " + es.toString());

				this.exitStatus(es);

				break;

			default:
				zinAssertAndLog(false, "missing case statement for: " + fsmstate.newstate);
		}


		var percentage_complete = a_states[fsmstate.newstate]['count'] / a_states['final']['count'];

		if (this.get(SyncFsmObserver.PROG_MAX) > 0)
			percentage_complete += (1 / a_states['final']['count']) * (this.get(SyncFsmObserver.PROG_CNT) / this.get(SyncFsmObserver.PROG_MAX));

		percentage_complete = percentage_complete * 100 + "%";

		this.set(SyncFsmObserver.PERCENTAGE_COMPLETE, percentage_complete);
	}

	return ret;
}
