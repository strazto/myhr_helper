// ==UserScript==
// @name         Unfuck your timesheets
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://myhr.sydney.edu.au/alesco-wss-v17/faces/WJ0000
// @match        https://uosp.ascenderpay.com/uosp-wss/faces/app/WJ0000*
// @icon         https://www.google.com/s2/favicons?domain=sydney.edu.au
// @require https://cdn.jsdelivr.net/gh/CoeJoder/waitForKeyElements.js@v1.2/waitForKeyElements.js
// @grant        none
// @run-at  document-end
// ==/UserScript==

(function() {
    'use strict';
    
    const parent_frame_id = "pt1:r1:0:pt1:Main::f";
    const parent_form_action_suffix = "Process_TS1";
    
    const header_regex = {
      work_date     : "^Work Date$",
      units         : "^Hours.*", 
      paycode       : "^Pay Code$",
      gl_override   : "^Resp Code$",
      gl_account    : "^Project Code$",
      gl_sub_account: "^Analysis Code$",
      leave_empty   : "^DO NOT USE.*",
      topic         : "^Topic$",
      topic_details : "^Topic Details$",
    };
    const row_delimiter = "P_LINE_AUDIT_ARRAY";

    const entry_input_names = {
      work_date     : "P_WORK_DATE",
      units         : "P_UNITS",
      paycode       : "P_PAYCODE",
      gl_override   : "P_GL_OVERRIDE",
      gl_account    : "P_GL_ACCOUNT",
      gl_sub_account: "P_GL_SUB_ACCOUNT",
      leave_empty   : "P_GL_PROJECT",
      topic         : "P_TOPIC",
      topic_details : "P_TOPIC_DETAILS",
    };

    const pairwise = function(arr, callback) {
      const result = []
      arr.reduce((prev, current) => {
        result.push(callback(prev, current))
        return current
      })
      return result
    }

    const col_idx_by_content = function(tr, content_regex) {
        var tr_list = Array.from(tr.children);
        return tr_list.findIndex((th, i) => {if (th.textContent.match(content_regex)) return true;});
    };

    const get_header_idxs = function(header_row, header_regex) {
        var out = {};

        for (const k in header_regex) {
            out[k] = col_idx_by_content(header_row, header_regex[k]);
        }

        return out;
    };
    
    const ts_form_selector = () => {
      const frames = document.querySelectorAll("iframe");
      var parent_frame = null;

      frames.forEach( (frame) => {
        if (frame.id == parent_frame_id) parent_frame = frame;
      });

      if (! parent_frame ) return null;

      const frameDoc = parent_frame.contentDocument;

      const parent_form = frameDoc.querySelector("#F1");
      
      if (! parent_form) return null;

      if (! parent_form.action ) return null;

      if (! parent_form.action.endsWith(parent_form_action_suffix) ) return null;

      return frameDoc.querySelectorAll("#F1");
    }
    
    const serialize_ts_form = (parent_form) => {
      const raw_data = new FormData(parent_form);

      const data_arr = [...raw_data];

      const delim_indices = data_arr
        .reduce(
          (out, elem, idx) => {
            if (elem[0] == "P_LINE_AUDIT_ARRAY") out.push(idx);
            return out;
          }, [])
        .concat(-1);
      
      const metadata_delim = delim_indices[0];

      var out = {metadata : {}, entries : []};

      out['metadata'] = Object.fromEntries(data_arr.slice(0, metadata_delim));

      out['entries'] = pairwise(
        delim_indices, 
        (curr, next) => Object.fromEntries(data_arr.slice(curr, next))
       );

      console.log(out);
      return out;
    }
    
    const on_ts_form_ready = async () => {
        console.log("will await parent_form");
        waitForKeyElements(ts_form_selector, (parent_form) => {
            console.log("FOUND PARENT FORM");

            const ts_table = parent_form.querySelector("table");

            const header_row = ts_table.querySelector("thead > tr");

            const header_idxs = get_header_idxs(header_row, header_regex);

            const ts_entries = ts_table.querySelector("#TSEntry");
            
            console.log({header_idxs: header_idxs});

            var serialize_btn = document.createElement("a");
            
            serialize_ts_form(parent_form);
        });
    }

    console.log("keen for ts form to be ready");

    on_ts_form_ready();

})();
