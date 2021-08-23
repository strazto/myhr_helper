// ==UserScript==
// @name         University of Sydney timesheet helper 
// @namespace    http://straz.to/
// @version      0.1
// @description  Improves the UX of the MyHR website at USYD - Allow export & import of timesheet forms to save re-typing.
// @homepage     https://straz.to
// @supportURL   https://github.com/matthewstrasiotto/myhr_helper/issues
// @downloadURL  https://raw.githubusercontent.com/matthewstrasiotto/myhr_helper/main/uni_userscript.js
// @author       Matthew Strasiotto
// @match        https://myhr.sydney.edu.au/alesco-wss-v17/faces/WJ0000
// @match        https://uosp.ascenderpay.com/uosp-wss/faces/*WJ0000*
// @icon         https://www.google.com/s2/favicons?domain=sydney.edu.au
// @require      https://cdn.jsdelivr.net/gh/CoeJoder/waitForKeyElements.js@v1.2/waitForKeyElements.js
// @require      https://unpkg.com/papaparse@5.3.1/papaparse.min.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    const homepage  = "https://github.com/matthewstrasiotto/myhr_helper";
    const badge_src = "https://img.shields.io/github/stars/matthewstrasiotto/myhr_helper?style=social"
    
    const stylesheet_text = `
      .myhr-helper-toolbox {
        display: grid;
        border:  darkmagenta;
        border-style: solid;
        border-width: thin;

        grid-template-columns: 1fr 1fr;
        grid-template-rows: auto;
        grid-template-areas:
          "top top"
          "left right";
      }

      .myhr-helper-info h4, .myhr-helper-info p {
        margin-top: 2px;
        margin-bottom: 2px;
        grid-area: top;
      }

      .mhr-helper-export-btn {
        grid-column: 1 / span 1;
      }
      .myhr-helper-import-btn {
        grid-column: 2 / span 1;
      }
    
      .myhr-helper-csv {
        grid-row: 2 / span 1;
      }

      .myhr-helper-json {
        grid-row: 3 / span 1;
      }
  `
    const ids = {
      container : "myhr-helper-toolbox",
      info      : "myhr-helper-info",
      export_hidden  : "myhr-helper--export",
      export_json_btn : "myhr-helper-export-json-btn",
      export_csv_btn     : "myhr-helper-export-csv-btn",
      import_json_btn    : "myhr-helper-import-json-btn",
      import_json_hidden : "myhr-helper--import-json",
      import_csv_btn     : "myhr-helper-import-csv-btn",
      import_csv_hidden  : "myhr-helper--import-csv",
    };    

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
    
    const export_entries_csv = (form_data, download_link) => {
      
      const blob = new Blob([Papa.unparse(form_data.entries)], {type: "text/csv"});
      download_link.download = get_filename() + ".csv";

      return blob;
    }
    const export_entries_json = (form_data, download_link) => {
      const blob = new Blob([JSON.stringify(form_data)], {type: "application/json"});
      download_link.download = get_filename() + ".json";
      return blob;
    }
    const export_entries = (e) => {
      console.log({fun: "export_entries", e:e});
      const frameDoc = get_frame_document();
      const ts_form = frameDoc.querySelector("#F1");

      if (! ts_form) return false;
      var download_link = frameDoc.getElementById(ids.export_hidden);
      
      if (download_link.href !== null && download_link.href !== "") {
        window.URL.revokeObjectURL(download_link.href);
      }

      const form_data = serialize_ts_form(ts_form);

      var handler = export_entries_json;

      if (e.srcElement.id == ids.export_csv_btn) handler = export_entries_csv;

      const blob = handler(form_data, download_link);
      download_link.href = window.URL.createObjectURL(blob);

      download_link.click();
    }
    const fill_timesheet_csv = (destination_form) => {
      const populate_dest = (e) => {
        const input_data = Papa.parse(e.target.result, {header : true});
        const input_entries = input_data.data;

        console.log({dest: destination_form, payload: input_data});

        fill_timesheet(input_entries, destination_form);
      }
      return populate_dest;
    }

    const fill_timesheet_json = (destination_form) => {
      
      const populate_dest = (e) => {

        const input_data = JSON.parse(e.target.result);
        const input_entries = input_data.entries;
        
        console.log({ dest: destination_form, payload: input_data});

        fill_timesheet(input_entries, destination_form);

        };


      return populate_dest;
    }
    
    // Give it a table row, tr, and check that all of the writable input fields are
    // untouched 
    const row_is_empty = (row) => {

      return writable_fields.every((field_name) => {
        const input_element = row.querySelector("[name='" + field_name + "']");

        if (input_element && input_element.value) {
          console.log({fun: "row_is_empty", msg: "Found non empty field, row not empty", row, field_name});
          return false;
        } 
        return true;
      });
    };

    const fill_timesheet = (input_entries, destination_form) => {

        const ts_table = destination_form.querySelector("#TSEntry");
        const ts_rows  = Array.from(ts_table.children);

        const find_first_empty = (ts_rows) => {

          return ts_rows.findIndex(row_is_empty);
        }
        
        const ts_entries_to_fill = ts_rows.filter(row_is_empty);


        input_entries.forEach((entry, i) => {
          const row = ts_entries_to_fill[i];

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
    const get_filename = () => {
      const ts_form = ts_form_selector()[0];

      const start_date = ts_form.querySelector("[name='P_START_DATE'").value;
      const job_number = ts_form.querySelector("[name='P_JOB_ARRAY'").value;
      const filename =  "timesheets_job_" + job_number + "_start_" + start_date;

      return filename;
    }

    const import_entries = (e) => {
      const file_list = e.target.files;
      console.log({fn: "import_entries", file_list : file_list});
      if (file_list.length < 1) return;

      const file = file_list[0];
      
      const frameDoc = get_frame_document();
      const ts_form = frameDoc.querySelector("#F1");

      if (! ts_form) return false;

      var onload_handler = fill_timesheet_json;

      if (file.type != "application/json") {
        onload_handler = fill_timesheet_csv;
      }

      const reader = new FileReader();
      reader.onload = onload_handler(ts_form); 
      reader.readAsText(file);
      
      // Allow the onchange event to be triggered even if the same file is chosen
      e.target.value = null;
    }
    
    const inject_stylesheet = () => {
      const frameDoc = get_frame_document();

      var style_element = frameDoc.createElement("style");
      style_element.innerText = stylesheet_text; 
      frameDoc.querySelector("head").appendChild(style_element);
    }
    
  const add_file_buttons = (container, ts_form) => {
        var export_json_btn = container.querySelector(`#${ids.export_json_btn}`);
        var export_csv_btn  = container.querySelector(`#${ids.export_csv_btn}`);
        var export_file_link = container.querySelector(`#${ids.export_hidden}`);
        
        export_file_link.download = get_filename() + ".json";
        
        var import_json_input = container.querySelector(`#${ids.import_json_hidden}`);
        var import_json_btn = container.querySelector(`#${ids.import_json_btn}`);

        var import_csv_input = container.querySelector(`#${ids.import_csv_hidden}`);
        var import_csv_btn   = container.querySelector(`#${ids.import_csv_btn}`);

        import_json_btn.addEventListener("click", (e) => {
          if (import_json_input) import_json_input.click();
        }, false);

        import_csv_btn.addEventListener("click", (e) => {
          if (import_csv_input) import_csv_input.click();
        }, false);

        import_csv_input.addEventListener("change", import_entries);
        import_json_input.addEventListener("change", import_entries);
        export_json_btn.addEventListener('click', export_entries);
        export_csv_btn.addEventListener('click', export_entries);
    }
    
    const add_socials = (container) => {
        const id = "myhr-helper-info";

        var repo_info = container.querySelector(`#${id}`);
        if (! repo_info ) { 
          repo_info = document.createElement("div");
          repo_info.id = id; 
          repo_info.classList.add("myhr-helper-info");
          container.appendChild(repo_info);
        }
        
        var repo_html = `
        <h4>${GM.info.script.name} v${GM.info.script.version}</h4>
        <p>
          ${GM.info.script.description}
          <br>
          Star on github <a href="${homepage}"><img src="${badge_src}"></a>
          <br>
          <a href="${GM.info.script.supportURL}">Report a problem / Request an improvement</a>
        </p>
        `
        repo_info.innerHTML = repo_html; 
    }

    const inject_elements = (ts_form) => {

        inject_stylesheet();
        
        var myhr_helper_container = document.createElement("div");
        myhr_helper_container.id = ids.container;
        myhr_helper_container.classList.add("myhr-helper-toolbox");
        
        myhr_helper_container.innerHTML = `
          <div id="${ids.info}" class="myhr-helper-info"></div>
          <a id="${ids.export_hidden}" hidden></a>
          <button id="${ids.export_json_btn}" class="myhr-helper-export-btn myhr-helper-json">
            Export JSON
          </button>
          <button id="${ids.export_csv_btn}" class="myhr-helper-export-btn myhr-helper-csv">
            Export CSV
          </button>
          <button id="${ids.import_json_btn}" class="myhr-helper-import-btn myhr-helper-json">
            Import JSON
          </button>
          <input  id="${ids.import_json_hidden}" type="file" accept="application/json" hidden>
          <button id="${ids.import_csv_btn}" class="myhr-helper-import-btn myhr-helper-csv">
            Import CSV
          </button>
          <input  id="${ids.import_csv_hidden}" type="file" accept=".csv, text/csv" hidden>
        `;
        
        add_socials(myhr_helper_container);
        add_file_buttons(myhr_helper_container, ts_form);
        ts_form.parentNode.insertBefore(myhr_helper_container, ts_form);

    }

    // TODO: Add function that resizes topic details, & adds validation / checks on topic details
    // max length for topic details is <= 100, and there are certain characters that are restricted
    // Disallowed chars:
    // "#%+;<>
    // Attach an event listener to the table, and then use event delegation to check the target type & length
    //
    // We also need validators for work date being < start date
    // validator for that bug where if your contract renews on a date, you cant have a timesheet that spans that date
    // but instead need to break it into two would be nice, but probably annoying to add 
    // To allow this to apply to new rows, probably should use a mutationobserver
    
    const add_validation_resize_fields = (ts_table) => {
      const topic_details_max_len = 100;
      const invalid_characters = ['"', '#', '%', '+', ';', '<', '>'];

      const topic_details = ts_table.querySelectorAll(`[name='${entry_input_names.topic_details}']`);
      topic_details.forEach((field) => {
        field.size = topic_details_max_len;
        field.maxlength = topic_details_max_len;
      });

      ts_table.addEventListener("change", (e) => {
        console.log(e);
        if (!(e.target && e.target.name && e.target.name == entry_input_names.topic_details)) {
          return;
        }

        const parent = e.target.parentElement;
        var warning_element = parent.querySelector('.myhr-helper-input-warnings');
        if (! warning_element) {
          warning_element = document.createElement('span');
          warning_element.classList.add('myhr-helper-input-warnings');

          parent.appendChild(warning_element);
        }

        var invalid_characters_seen = [];

        invalid_characters.forEach((c) => {
          if (e.target.value && e.target.value.includes(c)) {
            invalid_characters_seen.push(c);
          }
        });

        warning_element.textContent = "";
        if (invalid_characters_seen.length > 0) {
          warning_element.textContent = "Invalid Characters: " + invalid_characters_seen.join(' ');
        }

      });
      

    }
    const on_ts_form_ready = async () => {
        waitForKeyElements(ts_form_selector, (parent_form) => {
            const ts_table = parent_form.querySelector("table");

            const header_row = ts_table.querySelector("thead > tr");

            const header_idxs = get_header_idxs(header_row, header_regex);

            const ts_entries = ts_table.querySelector("#TSEntry");
            
            inject_elements(parent_form);
            
            add_validation_resize_fields(ts_table);

        });
    }

    on_ts_form_ready();

})();
