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
	var a_states_of_interest = { stAuth : 0,       stLoad: 1,     stSync: 2,     stGetContact: 3,    stSyncGal: 4, stLoadTb : 5, 
	                             stSyncPrepare: 6, stUpdateTb: 7, stUpdateZm: 8, stUpdateCleanup: 9, final: 10 };

	this.m_logger.debug("update: fsmstate: " + (fsmstate ? fsmstate.toString() : "null"));

	if (isPropertyPresent(a_states_of_interest, fsmstate.newstate))
	{
		var context = fsmstate.context; // SyncFsm
		this.state = context.state;
		ret = true;

		switch(fsmstate.newstate)
		{
			case 'stAuth':          this.progressReportOnSource(context.state.sourceid_zm, "RemoteAuth"); break;
			case 'stLoad':          this.progressReportOn("Load");                                        break;
			case 'stSync':          this.progressReportOnSource(context.state.sourceid_zm, "RemoteSync"); break;
			case 'stSyncGal':       this.progressReportOnSource(context.state.sourceid_zm, "GetGAL");     break;
			case 'stLoadTb':        this.progressReportOnSource(context.state.sourceid_zm, "GetItem");    break;
			case 'stSyncPrepare':   this.progressReportOn("Converge");                                    break;
			case 'stUpdateTb':      this.progressReportOnSource(context.state.sourceid_tb, "Put");        break;
			case 'stUpdateCleanup': this.progressReportOn("Saving");                                      break;

			case 'stGetContact':
				var id;
				for (id in context.state.aQueue)
					break;

				if (typeof(id) != 'undefined')
				{
					var op = this.buildOp(context.state.sourceid_zm, "GetItem");

					if (this.get(SyncFsmObserver.OP) != op)
					{
						// this.m_logger.debug("4401: op: " + op + " this.get(SyncFsmObserver.OP): " + this.get(SyncFsmObserver.OP));
						this.progressReportOnSource(context.state.sourceid_zm, "GetItem", aToLength(context.state.aQueue));
					}

					this.set(SyncFsmObserver.PROG_CNT, this.get(SyncFsmObserver.PROG_CNT) + 1);
				}
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
					var op = this.buildOp(sourceid, "Put");

					if (this.get(SyncFsmObserver.OP) != op)
					{
						var cTotal = 0; // aSuo definitely needs an iterator!
						for (var x in context.state.sources)
							if (context.state.sources[x]['format'] == FORMAT_ZM)
								for (y in context.state.aSuo[x])
										for (var z in context.state.aSuo[x][y])
											cTotal++;

						this.progressReportOnSource(sourceid, "Put", cTotal);

						this.m_logger.debug("4401: this.get(SyncFsmObserver.OP): " + this.get(SyncFsmObserver.OP) + " cTotal: " + cTotal);
					}

					this.set(SyncFsmObserver.PROG_CNT, this.get(SyncFsmObserver.PROG_CNT) + 1);
					this.m_logger.debug("4402: PROG_CNT: " + this.get(SyncFsmObserver.PROG_CNT));
				}
				break;

			case 'final':
				if (fsmstate.event == 'evCancel')
					this.progressReportOn("Cancelled");
				else
					this.progressReportOn("Done");

				var es = new SyncFsmExitStatus();

				if (fsmstate.event == 'evLackIntegrity')
				{
					es.m_exit_status = 1;
					es.m_fail_code   = SyncFsmExitStatus.FailOnIntegrity;
					es.m_fail_detail = context.state.m_lack_integrity;
				}
				else if (context.state.id_fsm == ZinMaestro.FSM_ID_AUTHONLY && context.state.authToken)
					es.m_exit_status = 0;
				else if (context.state.id_fsm == ZinMaestro.FSM_ID_TWOWAY && fsmstate.event == 'evNext')
					es.m_exit_status = 0;
				else
				{
					es.m_exit_status = 1;

					switch (context.state.m_soap_state.summaryCode())
					{
						case SoapState.POST_RESPONSE_FAIL_ON_SERVICE: es.m_fail_code = SyncFsmExitStatus.FailOnService; break;
						case SoapState.POST_RESPONSE_FAIL_ON_FAULT:   es.m_fail_code = SyncFsmExitStatus.FailOnFault;   break;
						case SoapState.CANCELLED:                     es.m_fail_code = SyncFsmExitStatus.FailOnCancel;  break;
						default:                                      es.m_fail_code = SyncFsmExitStatus.FailOnUnknown; break;
					}

					if (es.m_fail_code == SyncFsmExitStatus.FailOnFault)
					{
						if (context.state.m_soap_state.m_faultstring)
							es.m_fail_detail = context.state.m_soap_state.m_faultstring;
						else if (context.state.m_soap_state.m_faultcode)
							es.m_fail_detail = context.state.m_soap_state.m_faultcode;
					}
				}

				this.m_logger.debug("exit status: " + es.toString());

				this.exitStatus(es);

				// there are three bits of "exit status" that the outside world might be interested in
				// ZinMaestro.FSM_ID_TWOWAY:
				// - last sync success: (time, maybe other stuff like conflicts...)
				// - last sync:         (time, success/fail and optional failure reason)
				// - an idea: next sync: when scheduled?
				//
				// ZinMaestro.FSM_ID_AUTHONLY:
				// - last auth: (time, success/fail and optional failure reason)
				//

				break;
		}

		var percentage_complete = 0;
		percentage_complete += a_states_of_interest[fsmstate.newstate] / a_states_of_interest['final'];

		if (this.get(SyncFsmObserver.PROG_MAX) > 0)
			percentage_complete += (1 / a_states_of_interest['final']) * (this.get(SyncFsmObserver.PROG_CNT) / this.get(SyncFsmObserver.PROG_MAX));

		percentage_complete = percentage_complete * 100 + "%";

		// this.m_logger.debug("4401: percentage_complete: " + percentage_complete);

		this.set(SyncFsmObserver.PERCENTAGE_COMPLETE, percentage_complete);
	}

	return ret;
}

