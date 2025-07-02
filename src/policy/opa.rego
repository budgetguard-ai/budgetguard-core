package budgetguard.policy

default allow = false

# Allow only when under budget and not accessing admin routes after hours
allow {
  input.usage < input.budget
  not deny_admin_after_hours
}

# Block access to admin routes after hours
deny_admin_after_hours {
  input.route == "/admin/tenant-usage"
  input.time > 20
}
