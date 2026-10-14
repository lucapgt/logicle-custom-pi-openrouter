# V4 opt-in chat safety: mode resolution

While loading the conversation's server-side Pi V4 binding, the ordinary Logicle composer is withheld. This prevents accidentally routing a prompt to the default chat handler before the Pi mode is known.

An unknown/error state still requires additional remediation: if the binding lookup fails, the current component falls back to ordinary Logicle mode. Production should fail closed and provide a retry action instead. Do not treat this incremental fix as a passed production security review.

No database migration or legacy route edits. No existing Docker or Pi runtime was accessed.
