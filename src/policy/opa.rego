package budgetguard.policy

default allow := false

# Allow only when under budget and not accessing admin routes after hours
allow if {
  input.usage < input.budget
  not deny_admin_after_hours
}

# Block access to admin routes after hours
deny_admin_after_hours if {
  input.route == "/admin/tenant-usage"
  input.time > 20
}
