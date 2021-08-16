// ==UserScript==
// @name         Unfuck your timesheets
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://myhr.sydney.edu.au/alesco-wss-v17/faces/WJ0000
// @icon         https://www.google.com/s2/favicons?domain=sydney.edu.au
// @grant        none
// @run-at  document-end
// ==/UserScript==

(function() {
    'use strict';

    const header_regex = {
      leave_empty : "^DO NOT USE.*",
      topic_details : "^Topic Details$"
    };

    const col_idx_by_content = function(tr, content_regex) {
        var tr_list = Array.from(tr.children);

        return tr_list.findIndex((th, i) => {if (th.textContent.match(content_regex)) return true;});

    };

    const get_header_idxs = function(header_row, header_regex) {
        out = {};

        for (k in header_regex) {
            out[k] = col_idx_by_content(header_row, header_regex[k]);
        }

        return out;
    };

    const checkElement = async selector => {
        while ( document.querySelector(selector) === null) {
            await new Promise( resolve =>  requestAnimationFrame(resolve) )
        }
        return document.querySelector(selector);
    };

    const on_ts_form_ready = async () => {
        console.log("will await parent_form");
        checkElement("#F1").then((parent_form) => {
            console.log("FOUND PARENT FORM");

            const ts_table = parent_form.querySelector("table");

            const header_row = ts_table.querySelector("thead > tr");

            const header_idxs = get_header_idxs(header_row, header_regex);

            const ts_entries = ts_table.querySelector("#TSEntry");
        });


    }

    console.log("keen for ts form to be ready");

    on_ts_form_ready();

})();
