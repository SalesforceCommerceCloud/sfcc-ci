/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/**
 * Sorts elements inside list ascending by property denoted by sortby. Ensures that elements
 * not defining the property to sort by are sorted to the end of the list.
 *
 * @param {Array} list the list of elements to sort
 * @param {String} sortby the property to sort list elements by
 */
function sort(list, sortby) {
    list.sort(function(a,b) {
        if (typeof(a[sortby]) === 'undefined' && typeof(b[sortby]) === 'undefined') {
            return 0;
        }
        if (typeof(a[sortby]) === 'undefined' || a[sortby] < b[sortby]) {
            return -1;
        }
        if (typeof(b[sortby]) === 'undefined' || a[sortby] > b[sortby]) {
            return 1;
        }
        return 0;
    });
    return list;
}

module.exports.sort = sort;