from app.log_processor import CommandEvent
from app.step_verifier import StepVerifier


def event(command: str, output: str = "", is_error: bool = False) -> CommandEvent:
    return CommandEvent(
        command=command,
        output=output,
        is_error=is_error,
        raw_context=command,
        trigger_reason="prompt-command",
    )


def test_ls_empty_output_completes_directory_step():
    verifier = StepVerifier()
    step = {"verify": {"commands": ["ls", "ls -l", "ll", "la", "ls -la"]}}
    assert verifier.verify(step, event("ls"), [], [event("ls")])


def test_command_prefix_requires_token_boundary():
    verifier = StepVerifier()
    step = {"verify": {"commands": ["ls", "ls -l"]}}
    assert not verifier.verify(step, event("lsls"), [], [event("lsls")])


def test_sequence_requires_all_commands_in_order():
    verifier = StepVerifier()
    step = {
        "verify": {
            "sequence": ["cp hello.txt hello-copy.txt", "mv hello-copy.txt renamed.txt"]
        }
    }
    history = [
        event("cp hello.txt hello-copy.txt"),
        event("mv hello-copy.txt renamed.txt"),
    ]
    assert verifier.verify(step, history[-1], [], history)


def test_sequence_does_not_complete_when_missing_or_reversed():
    verifier = StepVerifier()
    step = {
        "verify": {
            "sequence": ["cp hello.txt hello-copy.txt", "mv hello-copy.txt renamed.txt"]
        }
    }
    assert not verifier.verify(step, event("cp hello.txt hello-copy.txt"), [], [event("cp hello.txt hello-copy.txt")])
    reversed_history = [
        event("mv hello-copy.txt renamed.txt"),
        event("cp hello.txt hello-copy.txt"),
    ]
    assert not verifier.verify(step, reversed_history[-1], [], reversed_history)


def test_command_match_tolerates_common_alias_options():
    verifier = StepVerifier()

    assert verifier._command_matches("ls --color=auto -l files/source", "ls -l files/source")
    assert verifier._command_matches("grep --color=auto alice regex/accounts.txt", "grep alice regex/accounts.txt")
