# Speech service enhancement

- Maintain generic speech enhancements here, never in official Harness source or installed files.
- Use public ConfigForm, speech Remote and UI slots. Rabi owns synthesis and voice selection.
- Each enhancement has an independent preference. Removing the plugin restores upstream behavior.
- Commit source, built artifacts, tests and documentation only. Exclude credentials, logs and user data.
- Verify capture cancellation, silence, insertion conflicts, reply ordering, unload and the built browser entry.
