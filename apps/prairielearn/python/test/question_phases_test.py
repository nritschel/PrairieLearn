import base64
import sys
import textwrap
from pathlib import Path
from typing import Any

import pytest
from prairielearn.internal.check_data import PROPS, Phase
from prairielearn.internal.question_phases import ElementInfo, RenderContext, process

NON_RENDER_PHASES: list[Phase] = ["prepare", "parse", "grade", "test", "file"]


def make_data(phase: Phase) -> dict[str, Any]:
    """Build a `data` dict with exactly the keys that `check_data` expects in `phase`."""
    data: dict[str, Any] = {}
    for key, info in PROPS.items():
        # `extensions` is added and removed by the pipeline around each element.
        if key == "extensions" or phase not in info["present_phases"]:
            continue
        match info["type"]:
            case "object":
                data[key] = {}
            case "integer":
                data[key] = 0
            case "number":
                data[key] = 0.0
            case "boolean":
                data[key] = False
            case "string":
                data[key] = ""

    data["options"] = {
        "course_element_files_url": "/course/elements",
        "course_element_extension_files_url": "/course/elementExtensions",
    }
    if phase == "render":
        data["panel"] = "question"
    if phase == "test":
        data["test_type"] = "correct"
    if phase == "file":
        data["filename"] = "file.txt"
    return data


class FakeCourse:
    """A course directory on disk whose elements are defined from inline source."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.elements: dict[str, ElementInfo] = {}

    def add_element(self, tag: str, source: str) -> Path:
        element_dir = self.path / "elements" / tag
        element_dir.mkdir(parents=True)
        (element_dir / f"{tag}.py").write_text(textwrap.dedent(source))
        self.elements[tag] = {"name": tag, "controller": f"{tag}.py", "type": "course"}
        return element_dir

    def process(
        self,
        phase: Phase,
        html: str,
        data: dict[str, Any] | None = None,
        element_extensions: dict[str, dict[str, dict[Any, Any]]] | None = None,
    ) -> tuple[str | None, set[str]]:
        context: RenderContext = {
            "html": html,
            "elements": self.elements,
            "element_extensions": element_extensions or {},
            "course_path": str(self.path),
        }
        return process(phase, make_data(phase) if data is None else data, context)


@pytest.fixture
def course(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> FakeCourse:
    # `process` changes the working directory and rebinds `sys.path` for each
    # element it runs; make sure neither leaks into other tests.
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "path", list(sys.path))
    return FakeCourse(tmp_path)


RECORDING_ELEMENT = """
    def prepare(element_html, data):
        data["params"].setdefault("prepared", []).append("{tag}")

    def parse(element_html, data):
        data["submitted_answers"]["{tag}"] = "parsed"

    def grade(element_html, data):
        data["partial_scores"]["{tag}"] = {{"score": 1, "weight": 1}}

    def test(element_html, data):
        data["raw_submitted_answers"]["{tag}"] = "tested"
"""


def test_render_replaces_element_and_keeps_surrounding_html(course: FakeCourse) -> None:
    course.add_element(
        "pl-a",
        """
        def render(element_html, data):
            return "<b>A</b>"
        """,
    )

    html, processed = course.process(
        "render", '<div class="c">before <pl-a></pl-a> after</div>'
    )

    assert html == '<div class="c">before <b>A</b> after</div>'
    assert processed == {"pl-a"}


def test_render_removes_element_without_render_function(course: FakeCourse) -> None:
    course.add_element(
        "pl-a",
        """
        def prepare(element_html, data):
            pass
        """,
    )

    html, processed = course.process("render", "<p><pl-a>hidden</pl-a> tail</p>")

    assert html == "<p> tail</p>"
    assert processed == {"pl-a"}


def test_render_ignores_unknown_tags(course: FakeCourse) -> None:
    html, processed = course.process("render", "<pl-unknown a='1'>x</pl-unknown>")

    assert html == '<pl-unknown a="1">x</pl-unknown>'
    assert processed == set()


def test_render_processes_elements_in_generated_html(course: FakeCourse) -> None:
    course.add_element(
        "pl-outer",
        """
        def render(element_html, data):
            return "<pl-inner></pl-inner>"
        """,
    )
    course.add_element(
        "pl-inner",
        """
        def render(element_html, data):
            return "INNER"
        """,
    )

    html, processed = course.process("render", "<pl-outer></pl-outer>")

    assert html == "INNER"
    assert processed == {"pl-outer", "pl-inner"}


def test_render_receives_element_html_without_tail(course: FakeCourse) -> None:
    course.add_element(
        "pl-a",
        """
        def render(element_html, data):
            return element_html.decode().replace("pl-a", "span")
        """,
    )

    html, _ = course.process("render", '<pl-a x="1">inner</pl-a> tail')

    assert html == '<span x="1">inner</span> tail'


def test_render_provides_element_urls_and_extensions(course: FakeCourse) -> None:
    course.add_element(
        "pl-a",
        """
        import json

        def render(element_html, data):
            return json.dumps({
                "element_url": data["options"]["client_files_element_url"],
                "extension_urls": data["options"]["client_files_extensions_url"],
                "extensions": data["extensions"],
            })
        """,
    )
    data = make_data("render")

    html, _ = course.process(
        "render",
        "<pl-a></pl-a>",
        data,
        element_extensions={"pl-a": {"my-ext": {"controller": "ext.py"}}},
    )

    assert html is not None
    assert (
        html.replace("&quot;", '"')
        == '{"element_url": "/course/elements/pl-a/clientFilesElement", '
        '"extension_urls": {"my-ext": "/course/elementExtensions/pl-a/my-ext/clientFilesExtension"}, '
        '"extensions": {"my-ext": {"controller": "ext.py"}}}'
    )
    # Per-element additions must not leak out of the pipeline.
    assert "extensions" not in data
    assert "client_files_element_url" not in data["options"]
    assert "client_files_extensions_url" not in data["options"]


def test_render_does_not_validate_data_changes(course: FakeCourse) -> None:
    # Legacy behavior: `check_data` is skipped for `render` and `file`.
    course.add_element(
        "pl-a",
        """
        def render(element_html, data):
            data["variant_seed"] = 42
            return ""
        """,
    )
    data = make_data("render")

    course.process("render", "<pl-a></pl-a>", data)

    assert data["variant_seed"] == 42


def test_render_element_module_state_persists_across_instances(
    course: FakeCourse,
) -> None:
    course.add_element(
        "pl-a",
        """
        count = 0

        def render(element_html, data):
            global count
            count += 1
            return str(count)
        """,
    )

    html, _ = course.process("render", "<pl-a></pl-a><pl-a></pl-a>")

    assert html == "12"


def test_render_supports_legacy_three_argument_signature(course: FakeCourse) -> None:
    course.add_element(
        "pl-a",
        """
        def render(element_html, element_index, data):
            return f"index={element_index}"
        """,
    )

    html, _ = course.process("render", "<pl-a></pl-a>")

    assert html == "index=None"


def test_controller_runs_in_element_directory_with_course_imports(
    course: FakeCourse,
) -> None:
    (course.path / "serverFilesCourse").mkdir()
    (course.path / "serverFilesCourse" / "course_helper.py").write_text(
        "VALUE = 'helper'"
    )
    element_dir = course.add_element(
        "pl-a",
        """
        import os
        import course_helper

        def render(element_html, data):
            return f"{os.getcwd()}|{course_helper.VALUE}"
        """,
    )

    html, _ = course.process("render", "<pl-a></pl-a>")

    assert html is not None
    cwd, value = html.split("|")
    assert Path(cwd).resolve() == element_dir.resolve()
    assert value == "helper"


@pytest.mark.parametrize(
    ("phase", "key", "expected"),
    [
        ("prepare", "params", {"prepared": ["pl-a"]}),
        ("parse", "submitted_answers", {"pl-a": "parsed"}),
        ("grade", "partial_scores", {"pl-a": {"score": 1, "weight": 1}}),
        ("test", "raw_submitted_answers", {"pl-a": "tested"}),
    ],
)
def test_non_render_phase_calls_phase_function(
    course: FakeCourse, phase: Phase, key: str, expected: dict[str, Any]
) -> None:
    course.add_element("pl-a", RECORDING_ELEMENT.format(tag="pl-a"))
    data = make_data(phase)

    result, processed = course.process(phase, "<p><pl-a></pl-a></p>", data)

    assert result is None
    assert processed == {"pl-a"}
    assert data[key] == expected


@pytest.mark.parametrize("phase", NON_RENDER_PHASES)
def test_non_render_phase_skips_elements_without_phase_function(
    course: FakeCourse, phase: Phase
) -> None:
    course.add_element(
        "pl-a",
        """
        def render(element_html, data):
            return "A"
        """,
    )
    data = make_data(phase)
    original = dict(data)

    result, processed = course.process(phase, "<pl-a></pl-a>", data)

    assert result == ("" if phase == "file" else None)
    assert processed == {"pl-a"}
    assert data == original


def test_prepare_visits_nested_source_elements_in_document_order(
    course: FakeCourse,
) -> None:
    for tag in ("pl-outer", "pl-inner", "pl-sibling"):
        course.add_element(tag, RECORDING_ELEMENT.format(tag=tag))
    data = make_data("prepare")

    course.process(
        "prepare",
        "<pl-outer><div><pl-inner></pl-inner></div></pl-outer><pl-sibling></pl-sibling>",
        data,
    )

    assert data["params"]["prepared"] == ["pl-outer", "pl-inner", "pl-sibling"]


def test_prepare_does_not_visit_elements_in_generated_html(course: FakeCourse) -> None:
    # Only `render` traverses the HTML that elements produce. Elements that exist
    # solely in another element's render output never see any other phase.
    course.add_element(
        "pl-outer",
        RECORDING_ELEMENT.format(tag="pl-outer")
        + """
        def render(element_html, data):
            return "<pl-inner></pl-inner>"
        """,
    )
    course.add_element("pl-inner", RECORDING_ELEMENT.format(tag="pl-inner"))
    data = make_data("prepare")

    _, processed = course.process("prepare", "<pl-outer></pl-outer>", data)

    assert data["params"]["prepared"] == ["pl-outer"]
    assert processed == {"pl-outer"}


def test_non_render_phase_receives_element_html_without_tail(
    course: FakeCourse,
) -> None:
    course.add_element(
        "pl-a",
        """
        def prepare(element_html, data):
            data["params"]["html"] = element_html
        """,
    )
    data = make_data("prepare")

    course.process("prepare", '<pl-a x="1">inner</pl-a> tail', data)

    # Controllers receive the serialized element as bytes, not `str`.
    assert data["params"]["html"] == b'<pl-a x="1">inner</pl-a>'


def test_prepare_rejects_illegal_data_modification(course: FakeCourse) -> None:
    course.add_element(
        "pl-a",
        """
        def prepare(element_html, data):
            data["variant_seed"] = 42
        """,
    )

    with pytest.raises(
        ValueError, match='data\\["variant_seed"\\] has been illegally modified'
    ):
        course.process("prepare", "<pl-a></pl-a>")


def test_prepare_rejects_extra_data_keys(course: FakeCourse) -> None:
    course.add_element(
        "pl-a",
        """
        def prepare(element_html, data):
            data["bogus"] = True
        """,
    )

    with pytest.raises(ValueError, match="data contains extra keys: bogus"):
        course.process("prepare", "<pl-a></pl-a>")


def test_file_phase_returns_base64_file_contents(course: FakeCourse) -> None:
    course.add_element(
        "pl-a",
        """
        def file(element_html, data):
            return f"contents of {data['filename']}"
        """,
    )

    result, _ = course.process("file", "<pl-a></pl-a>")

    assert result == base64.b64encode(b"contents of file.txt").decode()


def test_file_phase_rejects_multiple_files(course: FakeCourse) -> None:
    course.add_element(
        "pl-a",
        """
        def file(element_html, data):
            return "contents"
        """,
    )

    with pytest.raises(RuntimeError, match="Another element already returned a file"):
        course.process("file", "<pl-a></pl-a><pl-a></pl-a>")


def test_error_note_identifies_element(course: FakeCourse) -> None:
    course.add_element(
        "pl-a",
        """
        def prepare(element_html, data):
            raise ValueError("boom")
        """,
    )

    with pytest.raises(ValueError, match="boom") as excinfo:
        course.process(
            "prepare",
            '<pl-a class="ignored" answers-name="q1" file-name="f.txt"></pl-a>',
        )

    assert excinfo.value.__notes__ == [
        'Error occurred while processing element <pl-a answers-name="q1" file-name="f.txt">'
    ]
