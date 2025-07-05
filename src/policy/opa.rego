package budgetguard.policy

default allow = false

allow if {
  all_periods_under_budget
  not deny_admin_after_hours
}

all_periods_under_budget if {
  every b in input.budgets {
    b.usage < b.budget
  }
}

deny_admin_after_hours if {
  input.route == "/admin/tenant-usage"
  input.time > 20
}
