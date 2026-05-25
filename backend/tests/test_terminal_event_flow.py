from app.main import (
    _append_terminal_buffer,
    _clear_session_runtime_state,
    _collect_new_command_events,
    session_terminal_buffers,
)


def test_collect_new_command_events_waits_for_returned_prompt():
    session_id = "test-waits-for-prompt"
    _clear_session_runtime_state(session_id)
    try:
        _append_terminal_buffer(session_id, "[student@lab ~]$ ls")
        assert _collect_new_command_events(session_id) == []

        _append_terminal_buffer(session_id, "\n[student@lab ~]$")
        events = _collect_new_command_events(session_id)
        assert len(events) == 1
        assert events[0].command == "ls"
        assert events[0].output == ""
    finally:
        _clear_session_runtime_state(session_id)


def test_collect_new_command_events_is_idempotent_without_new_chunks():
    session_id = "test-idempotent-collect"
    _clear_session_runtime_state(session_id)
    try:
        _append_terminal_buffer(session_id, "[student@lab ~]$ ls\n[student@lab ~]$")
        assert [event.command for event in _collect_new_command_events(session_id)] == ["ls"]
        assert _collect_new_command_events(session_id) == []
        assert "lsls" not in session_terminal_buffers[session_id]
    finally:
        _clear_session_runtime_state(session_id)
