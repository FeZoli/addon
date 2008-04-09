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

include("chrome://zindus/content/syncfsmobserver.js");
include("chrome://zindus/content/windowcollection.js");
include("chrome://zindus/content/statuspanel.js");

function ZinTimerFunctorSync(id_fsm_functor, on_finish_function, on_finish_function_arg)
{
	zinAssert(arguments.length == 3);

	this.m_logger                 = newZinLogger("ZinTimerFunctorSync");
	this.m_es                     = new SyncFsmExitStatus();
	this.m_sfo                    = new SyncFsmObserver(this.m_es);
	this.m_zwc                    = new ZinWindowCollection(SHOW_STATUS_PANEL_IN);
	this.m_id_fsm_functor         = id_fsm_functor;
	this.m_syncfsm                = null;
	this.m_timeoutID              = null;
	this.is_running               = false;
	this.m_on_finish_function     = on_finish_function;
	this.m_on_finish_function_arg = on_finish_function_arg;
	this.m_is_fsm_functor_first_entry = true;
}

ZinTimerFunctorSync.prototype.cancel = function()
{
	if (this.is_running)
		this.m_syncfsm.cancel(this.m_timeoutID);
}

ZinTimerFunctorSync.prototype.run = function()
{
	this.m_logger.debug("run: m_id_fsm_functor: " + this.m_id_fsm_functor);

	ZinMaestro.notifyFunctorRegister(this, this.onFsmStateChangeFunctor, this.m_id_fsm_functor, ZinMaestro.FSM_GROUP_SYNC);
}

ZinTimerFunctorSync.prototype.onFsmStateChangeFunctor = function(fsmstate)
{
	this.m_logger.debug("onFsmStateChangeFunctor: entering: m_id_fsm_functor: " + this.m_id_fsm_functor + " fsmstate: " + (fsmstate ? fsmstate.toString() : "null"));

	if (this.m_is_fsm_functor_first_entry)
	{
		if (fsmstate)
		{
			this.m_logger.debug("onFsmStateChangeFunctor: fsm is running - backing off");
		}
		else
		{
			this.m_is_fsm_functor_first_entry = false;
			this.m_logger.debug("onFsmStateChangeFunctor: fsm is not running - starting... ");
		
			this.m_zwc.populate();

			var functor_unhide_progresspanel = {
				run: function(win) {
					win.document.getElementById('zindus-progresspanel').setAttribute('hidden', false);
				}
			};

			this.m_zwc.forEach(functor_unhide_progresspanel);

			newZinLogger().info("sync start:  " + getFriendlyTimeString() + " version: " + APP_VERSION_NUMBER);

			this.m_syncfsm = new SyncFsmZmTwoWay();
			this.m_syncfsm.initialise();
			this.m_syncfsm.setCredentials();
			this.m_syncfsm.start(window);
			this.is_running = true;
		}
	}
	else
	{
		this.m_timeoutID = fsmstate.timeoutID;

		var is_window_update_required = this.m_sfo.update(fsmstate);

		if (is_window_update_required)
		{
			var functor_update_progresspanel = {
				context: this,
				run: function(win) {
					// the window might have disappeared between when we iterated all open windows and now - so we test that
					// the element exists just before setting it's attribute...
					//
					if (win.document && win.document.getElementById("zindus-progresspanel"))
					{
						var el_statuspanel_progress_meter  = win.document.getElementById("zindus-progresspanel-progress-meter");
						var el_statuspanel_progress_label  = win.document.getElementById("zindus-progresspanel-progress-label");
						var el_statuspanel_logo            = win.document.getElementById("zindus-statuspanel-logo");
						var el_statuspanel_logo_processing = win.document.getElementById("zindus-statuspanel-logo-processing");

						el_statuspanel_progress_meter.setAttribute('value', this.context.m_sfo.get(SyncFsmObserver.PERCENTAGE_COMPLETE) );
						el_statuspanel_progress_label.setAttribute('value', this.context.m_sfo.progressToString());
						el_statuspanel_logo.setAttribute('hidden', true);
						el_statuspanel_logo_processing.setAttribute('hidden', false);
					}
				}
			};

			this.m_zwc.forEach(functor_update_progresspanel);
		}

		if (fsmstate.isFinal())
		{
			StatusPanel.save(this.m_es);

			var functor_hide_progresspanel = {
				run: function(win) {
					if (win.document && win.document.getElementById("zindus-progresspanel"))
					{
						win.document.getElementById("zindus-progresspanel-progress-label").setAttribute('value', "");
						win.document.getElementById('zindus-progresspanel').setAttribute('hidden', true);
						win.document.getElementById('zindus-statuspanel-logo').setAttribute('hidden', false);
						win.document.getElementById('zindus-statuspanel-logo-processing').setAttribute('hidden', true);
					}
				}
			};

			this.m_zwc.forEach(functor_hide_progresspanel);
			
			StatusPanel.update(this.m_zwc);

			this.finish();
		}
	}
}

ZinTimerFunctorSync.prototype.finish = function()
{
	newZinLogger().info("sync finish: " + getFriendlyTimeString());

	ZinMaestro.notifyFunctorUnregister(this.m_id_fsm_functor);

	this.is_running = false;

	if (this.m_on_finish_function)
		this.m_on_finish_function(this.m_on_finish_function_arg);
}
