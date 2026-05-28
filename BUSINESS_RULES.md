# EMS Chores Business Rules

This document explains the operating rules behind EMS Chores in plain language. It is not a technical design document and does not describe every screen or feature.

## Purpose

EMS Chores tracks whether important shift-start, station, truck, NARC box, and expiration work is completed, missed, reassigned, or still unresolved.

The system should answer three practical questions:

1. Who is working and what assets are they responsible for?
2. What work is due for those people, trucks, and NARC boxes?
3. If the work is not done, who needs to know and what should happen next?

## Shifts

A shift is the record of who worked, when they worked, and what they were responsible for during that shift.

- Shifts can be 24 or 48 hours.
- A shift remains current until its actual end date and time, even after midnight.
- A shift becomes historical only after its actual end time has passed.
- Employees may edit their current shift details when they need to correct trucks, partner, NARC box, start/end time, or similar details.
- Historical shift edits require supervisor-level permission and should be auditable.

## Shift Responsibility

Shift Setup records actual responsibility for the day, not a perfect theoretical assignment.

- Harrison crews usually have two bay/truck responsibilities.
- Bays are assignment details, not assets.
- Trucks/units are assets.
- NARC boxes are assets.
- A bay does not permanently own a truck.
- A shift can be responsible for a different truck or NARC box than usual because of backup trucks, repairs, trades, or unusual circumstances.

The system should reflect what the crew actually ended up responsible for.

## Work Types

Work falls into two broad ownership groups.

**Asset Work**

Asset work belongs to a truck/unit or NARC box first. A shift may claim responsibility for that work while it has the asset.

Examples:

- Daily Truck Check
- Monthly Expires
- Quarterly Expires
- NARC Expires
- Future NARC Box Check

**Crew/Station Work**

Crew or station work exists because a shift or station crew exists.

Examples:

- Bathroom
- Garage
- Kitchen
- Quarters
- Additional one-off chores

Station chores are less critical than asset work. If a Harrison crew does not run, its station chore may simply not be created or escalated.

## Persistent vs Forfeitable

Every chore template needs a lifecycle rule: persistent or forfeitable.

**Persistent Work**

Persistent work remains necessary until someone completes it.

Examples:

- Monthly Expires
- Quarterly Expires
- NARC Expires

If persistent work is missed during the original responsibility window, it is still important and still needs to be completed later.

**Forfeitable Work**

Forfeitable work has a meaningful window. If the window closes, the opportunity is gone.

Examples:

- Daily Truck Check
- NARC Box Check

If a truck check is not done during the proper window, it cannot truly be made up later. It becomes a missed accountability record, not a task to repeat later.

## Due, Overdue, Missed, and Late

These terms are separate.

**Due**

The time when the work is expected to be completed.

Common default: shift start plus 1 hour.

**Overdue**

The work is past its due time but still actionable.

Example: a crew gets a call right after shift start and completes the truck check later in the shift window.

**Missed**

The completion window closed before the responsible person or crew completed the work.

For forfeitable work, missed is final for performance purposes. It cannot be made up.

For persistent work, missed means the originally responsible person or crew failed to complete it in their window, but the work still needs to be completed by someone.

**Late**

Late applies to persistent work after the original window closes and the work is eventually completed.

Forfeitable work does not have a late-completion category. It is either completed within the window or missed.

## Performance Credit

Performance should separate responsibility, completion, missed work, and rescue work.

- The person who completes work should be recorded.
- The time of completion should be recorded.
- If the originally responsible employee or crew completes persistent work after the window closes, it counts as a late completion for them.
- If someone else completes persistent work after the original crew missed it, the original crew still has the miss.
- The person who later completes that persistent work receives normal completion credit.
- That completion adds to the completing employee's numerator and denominator.
- There is no extra credit for rescue work, but it should count because the employee actually completed the work.

The command-level dashboard and employee performance are related but not identical:

- Employee performance asks: how did this employee do with work they were responsible for or completed?
- The dashboard asks: is the important service-wide work getting done?

## Scheduled Work

Some work should exist even before a shift claims it.

Examples:

- Monthly Expires for all tracked units
- Quarterly Expires for all tracked units
- NARC Expires for all active NARC boxes A-L
- Daily Truck Checks for units when appropriate
- Future NARC Box Checks

This matters because a truck or NARC box may not be assigned to any shift. It may be at the shop, in the safe, forgotten, or otherwise unclaimed. Critical asset work should still be visible to supervisors when it is unclaimed, overdue, missed, or unresolved.

## Claiming Scheduled Work

When a shift takes responsibility for a truck or NARC box, the shift can claim the related scheduled work.

- If the scheduled work is pending, the shift becomes responsible for completing it.
- If the work was already completed by someone else, the current shift should see that it is already complete.
- Completed work should not be duplicated.
- Completion credit stays with the person or crew that actually completed the work.

If a shift edits its assets:

- Pending work for removed assets should be released from that shift.
- Pending work for newly added assets should be claimed by that shift.
- Completed work should not be erased or reassigned.

## Unassigned Work

Unassigned critical asset work needs supervisor visibility.

Examples:

- Unit 10 Monthly Expires is due but no shift claimed Unit 10.
- Box H NARC Expires is due but Box H is in the safe.
- A truck check was expected but no crew claimed the unit.

Supervisors should eventually be able to:

- assign the work to a shift,
- complete it themselves,
- mark it not applicable for a reason,
- or document that the asset was out of service.

Work should not be deleted just because the asset was at the shop or unavailable. The operational record should remain.

## Not Applicable / Out Of Service

Sometimes work should not count as a miss because the asset was legitimately unavailable.

Examples:

- Unit at the mechanic
- Unit out of service
- NARC box unavailable or inactive
- Long-term remount or repair

Supervisors should be able to mark work not applicable with a reason. This removes it from the active problem list without erasing the record.

## NARC Boxes

NARC boxes are tracked assets.

- NARC boxes are labeled A-L.
- NARC Expires are tied to the NARC box, not merely the truck.
- A staffed ALS truck may carry a NARC box.
- Some NARC boxes may sit in the safe on a given day.
- On NARC Expires day, all active NARC boxes still need to be accounted for.

## Units / Trucks

Monthly and Quarterly Expires apply to all tracked units:

- Units 1-11
- Unit 14
- Unit 20 Explorer

Whether a unit is frontline or backup does not exclude it from Expires tracking.

## Supervisor Visibility

Supervisors, Admins, and Dom-level users need a higher-level view than an individual crew member.

Supervisor views should eventually distinguish:

- persistent critical work that still needs to be done,
- forfeitable work that was missed,
- unassigned work,
- late completions,
- work marked not applicable,
- and assets with no current responsible shift.

The red urgent expires ticker should focus on persistent critical work that still needs action. Missed forfeitable work should be visible, but it is a different kind of problem.

## Audit Rules

The system should preserve accountability.

- Record who completed work.
- Record when they completed it.
- Record who changed a completed or historical record.
- Do not erase completion credit when responsibility changes later.
- Do not silently rewrite history to match the current assignment.

## Chore Template Rules

Chore templates should eventually be configurable by several independent dimensions:

- asset scope: truck, NARC box, crew, or station
- lifecycle: persistent or forfeitable
- criticality: critical or routine
- generation: independent of shifts or only when a shift exists
- station applicability
- license/credential applicability
- frequency or schedule rule
- specific asset groups when needed

These are separate settings. A chore is not simply "daily" or "persistent"; it may be truck-based, forfeitable, critical, and independently generated all at the same time.
