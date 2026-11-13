---
id: SCHED-4515
title: List holds still; "N new" bar brings new incidents in
status: done
plan: R1 (changed), R2
---

Product's decision after the step-1 recording (00:08: a live insert moved the rows, and Ack on INC-1836 acked
INC-2003):

> The list holds still while it is on screen; a "N new" bar brings new incidents in on click. Ack stays on the row.

- After the first load, refreshes (R4, every 2 s) no longer change the list. New incidents are counted on a bar
  (`data-testid="new-bar"`, "N new incidents"); it is hidden when nothing is new.
- The bar's space is always reserved, so showing it does not push the list down.
- Clicking the bar brings the new incidents in at the top, newest first, and hides the bar. Acked marks stay on
  their rows.

Acceptance: leave the board open with the pointer on a row's Ack; new incidents arrive; the rows do not move, the
bar shows the count, and the click acks the row it was aimed at. Clicking the bar puts the new incidents on top.
