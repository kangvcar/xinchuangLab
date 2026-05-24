from app.log_processor import LogProcessor


def test_clean_removes_ansi_codes():
    processor = LogProcessor()
    text = "\x1b[32mstudent@lab:~$ ls\x1b[0m\r\ntotal 0"
    assert processor.clean(text) == "student@lab:~$ ls\ntotal 0"


def test_clean_removes_osc_title_sequences():
    processor = LogProcessor()
    text = "\x1b]0;student@lab:~\x07[student@lab ~]$ ls"
    assert processor.clean(text) == "[student@lab ~]$ ls"


def test_extract_latest_command_from_prompt():
    processor = LogProcessor()
    text = "student@lab:~$ pwd\n/home/student\nstudent@lab:~$ ls -l"
    assert processor.extract_latest_command(text) == "ls -l"


def test_error_triggers_ai():
    processor = LogProcessor()
    assert processor.should_trigger("student@lab:~$ foo\nfoo: command not found")


def test_login_banner_does_not_trigger_ai():
    processor = LogProcessor()
    text = """Welcome to 6.6.87.2-microsoft-standard-WSL2
System information as of time: Sun May 24 08:52:45 UTC 2026
System load: 0.00
[student@abacfc775f11 ~]$"""
    assert processor.parse_command_event(text) is None
    assert not processor.should_trigger(text)


def test_script_start_banner_does_not_trigger_ai():
    processor = LogProcessor()
    text = """Script started on 2026-05-24 10:18:17+00:00 [TERM="xterm-256color"]
Welcome to 6.6.87.2-microsoft-standard-WSL2
System information as of time: Sun May 24 10:18:17 UTC 2026
0;student@7b323cbb46fe:~[student@7b323cbb46fe ~]$"""
    assert processor.parse_command_event(text) is None
    assert not processor.should_trigger(text)


def test_bare_command_completed_by_prompt_triggers_ai():
    processor = LogProcessor()
    event = processor.parse_command_event("mkdir linux_lab\n[student@lab ~]$")
    assert event is not None
    assert event.command == "mkdir linux_lab"
    assert event.output == ""


def test_split_terminal_stream_reconstructs_command_before_analysis():
    processor = LogProcessor()
    raw_stream = "".join(
        [
            "\x1b]0;student@lab:~\x07[student@lab ~]$ ",
            "pw",
            "d",
            "\n/home/student\n\x1b]0;student@lab:~\x07[student@lab ~]$ ",
        ]
    )
    event = processor.parse_command_event(processor.clean(raw_stream))
    assert event is not None
    assert event.command == "pwd"
    assert event.output == "/home/student"


def test_path_output_with_prompt_is_not_treated_as_command():
    processor = LogProcessor()
    assert processor.parse_command_event("/home/student\n[student@lab ~]$") is None


def test_command_event_fingerprint_is_stable():
    processor = LogProcessor()
    event = processor.parse_command_event("pwd\n/home/student\n[student@lab ~]$")
    assert event is not None
    assert processor.event_fingerprint(event) == processor.event_fingerprint(event)
