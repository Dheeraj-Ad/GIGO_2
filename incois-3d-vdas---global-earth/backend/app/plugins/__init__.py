"""
Instrument plugin modules.

Every module in this package is imported at startup by
``app.core.plugins.load_plugins()``; any class decorated with
``@register_plugin`` becomes available through the generic
``/api/v1/insitu/{plugin}/...`` endpoints and appears in the frontend's
Instruments panel automatically.

Drop a new file here to add a sensor type — nothing else needs editing.
See ``mooring_erddap.py`` for the most complete worked example (it also
demonstrates the config-driven route: several distinct instrument types
sharing one adapter via ``config/data_sources.yaml``).
"""
