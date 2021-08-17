// ==UserScript==
// @name         University of Sydney timesheet helper 
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Improves the UX of the MyHR website at USYD - Allow export & import of timesheet forms to save re-typing.
// @homepage     https://straz.to
// @supportURL   https://github.com/matthewstrasiotto/myhr_helper/issues
// @downloadURL  https://raw.githubusercontent.com/matthewstrasiotto/myhr_helper/main/uni_userscript.js
// @author       Matthew Strasiotto
// @match        https://myhr.sydney.edu.au/alesco-wss-v17/faces/WJ0000
// @match        https://uosp.ascenderpay.com/uosp-wss/faces/app/WJ0000*
// @icon         https://www.google.com/s2/favicons?domain=sydney.edu.au
// @require      https://cdn.jsdelivr.net/gh/CoeJoder/waitForKeyElements.js@v1.2/waitForKeyElements.js
// @grant        none
// @run-at       document-end
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
    const autofilled_entry_fields = [ "P_JOB" ];
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

    const writable_fields = [
      "P_WORK_DATE", "P_UNITS", "P_PAYCODE", "P_GL_OVERRIDE", "P_GL_ACCOUNT", "P_GL_SUB_ACCOUNT",
      "P_TOPIC", "P_TOPIC_DETAILS"
    ];


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

    const get_frame_document = () => {
      const frames = document.querySelectorAll("iframe");
      var parent_frame = null;

      frames.forEach( (frame) => {
        if (frame.id == parent_frame_id) parent_frame = frame;
      });

      if (! parent_frame ) return null;

      const frameDoc = parent_frame.contentDocument;
      return frameDoc;
    }
    
    const ts_form_selector = () => {
      const frameDoc = get_frame_document();

      if (! frameDoc) return null;
      const parent_form = frameDoc.querySelector("#F1");
      
      if (! parent_form) return null;

      if (! parent_form.action ) return null;

      if (! parent_form.action.endsWith(parent_form_action_suffix) ) return null;

      return frameDoc.querySelectorAll("#F1");
    }
    const is_entry_filled = (entry_object) => {
      for (const field in entry_object ) {
        if (! autofilled_entry_fields.includes(field) ) {
          if (! entry_object[field] ) continue;
          return entry_object.field !== "";
        }
      }
      return false;
    };
    
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

      out['entries'] = out['entries'].filter(is_entry_filled);
      console.log(out);
      return out;
    }
    
    const export_entries = () => {
      const frameDoc = get_frame_document();
      const ts_form = frameDoc.querySelector("#F1");

      if (! ts_form) return false;
      var download_btn = frameDoc.querySelector("#download-timesheet");
      
      if (download_btn.href !== null && download_btn.href !== "") {
        window.URL.revokeObjectURL(download_btn.href);
      }

      const form_data = serialize_ts_form(ts_form);
      
      const blob = new Blob([JSON.stringify(form_data)], {type: "application/json"});

      download_btn.href = window.URL.createObjectURL(blob);

      download_btn.click();
    }

    const fill_timesheet = (destination_form) => {
      
      const populate_dest = (e) => {

        const input_data = JSON.parse(e.target.result);
        const input_entries = input_data.entries;
        
        console.log({ dest: destination_form, payload: input_data});


        const ts_table = destination_form.querySelector("#TSEntry");
        const ts_rows  = ts_table.children;
        
        input_entries.forEach((entry, i) => {
          const row = ts_rows[i];

          console.log({entry, i, row});

          writable_fields.forEach(( field_name ) => {
            var input_element = row.querySelector("[name='" + field_name + "']");
            if (entry[field_name]) {
              console.log({msg: "setting input element", input_element, field_name});
              input_element.value = entry[field_name];
            }
          });
        });

      }

      return populate_dest;
    }

    const import_entries = (e) => {
      const file_list = e.target.files;

      if (file_list.length < 1) return;

      const file = file_list[0];
      
      const frameDoc = get_frame_document();
      const ts_form = frameDoc.querySelector("#F1");

      if (! ts_form) return false;
      
      const reader = new FileReader();
      reader.onload = fill_timesheet(ts_form); 
      reader.readAsText(file);
    }
    
    const add_file_buttons = (ts_form) => {

        var export_btn = document.createElement("button");
        export_btn.id = "export-timesheet";
        export_btn.textContent = "Export";
        

        var download_btn = document.createElement("a");
        download_btn.id = "download-timesheet";
        download_btn.text = "Download";
        //TODO: FINISH HERE
        const start_date = ts_form.querySelector("[name='P_START_DATE'").value;
        const job_number = ts_form.querySelector("[name='P_JOB_ARRAY'").value;
        
        download_btn.download = "timesheets_job_" + job_number + "_start_" + start_date + ".json";
        download_btn.hidden = true;

        var upload_input    = document.createElement("input");
        upload_input.id     = "upload-timesheet";
        upload_input.type   = "file";
        upload_input.accept = "application/json";
        upload_input.hidden = true;

        
        var upload_btn = document.createElement("button");
        upload_btn.id = "import-timesheet";
        upload_btn.textContent = "Import";

        upload_btn.addEventListener("click", (e) => {
          if (upload_input) upload_input.click();
        }, false);

        ts_form.parentNode.insertBefore(export_btn, ts_form);
        ts_form.parentNode.insertBefore(download_btn, ts_form);
        ts_form.parentNode.insertBefore(upload_input, ts_form);
        ts_form.parentNode.insertBefore(upload_btn, ts_form);

        upload_input.addEventListener("change", import_entries);
        export_btn.addEventListener('click', export_entries);
    }
    
    const on_ts_form_ready = async () => {
        console.log("will await parent_form");
        waitForKeyElements(ts_form_selector, (parent_form) => {
            console.log("FOUND PARENT FORM");

            const ts_table = parent_form.querySelector("table");

            const header_row = ts_table.querySelector("thead > tr");

            const header_idxs = get_header_idxs(header_row, header_regex);

            const ts_entries = ts_table.querySelector("#TSEntry");
            
            add_file_buttons(parent_form);

            console.log({header_idxs: header_idxs});

        });
    }

    console.log("keen for ts form to be ready");

    on_ts_form_ready();

})();
