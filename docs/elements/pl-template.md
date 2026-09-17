# `pl-template` element

Renders reusable HTML, which may include other elements, from Mustache templates.

## Sample element

```html title="question.html"
<pl-template file-name="templates/outer_template.mustache">
  <pl-variable name="show">True</pl-variable>
  <pl-variable name="section_header">This is the section header.</pl-variable>
  <pl-variable name="section_body">This is the section body.</pl-variable>
</pl-template>
```

Along with the sample usage of the element, we include a sample template file. This is the file
`templates/outer_template.mustache`, stored in the course's `serverFilesCourse` directory:

```html title="templates/outer_template.mustache"
<div class="card mb-1 mt-1">
  <div class="card-header" style="cursor: pointer">
    <div
      class="card-title d-flex justify-content-between"
      data-bs-toggle="collapse"
      data-bs-target="#collapse-{{uuid}}"
    >
      <div>{{section_header}}</div>
      <div class="fa fa-angle-down"></div>
    </div>
  </div>

  <div class="collapse{{#show}} show{{/show}}" id="collapse-{{uuid}}">
    <div class="card-body">
      <div class="card-text">{{{section_body}}}</div>
    </div>
  </div>
</div>
```

!!! note

    The sample element did not define the `uuid` variable, as each `pl-template` element
    has a unique one defined internally.

## Customizations

| Attribute               | Type                                                                                                      | Default               | Description                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `directory`             | `"question"`, `"clientFilesQuestion"`, `"clientFilesCourse"`, `"serverFilesCourse"`, `"courseExtensions"` | `"serverFilesCourse"` | Parent directory to locate `file-name`.                                                                             |
| `file-name`             | string                                                                                                    | —                     | File name of the outer template to use.                                                                             |
| `log-tag-warnings`      | boolean                                                                                                   | true                  | Whether to log a warning if a rendered template contains a `<markdown>` tag, which has no effect inside a template. |
| `log-variable-warnings` | boolean                                                                                                   | false                 | Whether to log warnings when rendering templates with undefined variables. Useful for debugging.                    |

Inside the `pl-template` element, variables for use in rendering the template may be specified with a `pl-variable` tag. Each `pl-variable` tag can be used to define a variable with data from a file or with the contents of the tag (but not both). Note that substitution is **not** applied to external files used in `pl-variable` (files are used as-is). The `pl-variable` tag supports the following attributes:

| Attribute         | Type                                                                                                      | Default               | Description                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| `directory`       | `"question"`, `"clientFilesQuestion"`, `"clientFilesCourse"`, `"serverFilesCourse"`, `"courseExtensions"` | `"serverFilesCourse"` | Parent directory to locate `file-name`.                       |
| `file-name`       | string                                                                                                    | —                     | File name to use if variable data is being taken from a file. |
| `name`            | string                                                                                                    | —                     | Variable name to assign the data defined by this tag.         |
| `trim-whitespace` | boolean                                                                                                   | true                  | Whether to trim whitespace of data specified by this tag.     |

## Details

When a template is rendered, all entries from `data["params"]` and `data["preferences"]` are included as available variables and may be used using the `{{params.variable_name}}` or `{{preferences.variable_name}}` syntax. Each instance of the `pl-template` element also has a unique `uuid` variable available for rendering. Templates may also be used within other templates.

The rendered template is processed exactly as if its contents had been written directly in `question.html`, so a template may contain any element, including elements that accept and grade student input. The template file and the element's attributes are validated when a question variant is created, so a missing template or an invalid attribute is reported at that point rather than when the question is first displayed.

!!! warning

    The `uuid` variable has a different value each time the template is rendered, which happens whenever the question is prepared, rendered, parsed, or graded. It is safe to use in DOM `id` attributes, but it must **never** be used in an `answers-name` attribute; pass the name in with a `pl-variable` instead.

!!! note

    The id `#` CSS selector does _not_ work for ids that start with a number, so uuids should be prefixed (as these may start with a number).

!!! note

    `<markdown>` tags are converted before any element is rendered, so they have no effect when produced by a template. Write Markdown outside of the template, or use plain HTML inside it.

## Templates with input elements

A template that contains an input element can be reused for several parts of a question. Here the answer name and prompt vary per part, while the correct answers are set by `server.py` as usual:

```html title="templates/question_part.mustache"
<div class="card my-2">
  <div class="card-header">{{{header}}}</div>
  <div class="card-body">
    <p>{{{prompt}}}</p>
    <pl-number-input answers-name="{{answers-name}}" label="{{{label}}}"></pl-number-input>
  </div>
</div>
```

```html title="question.html"
<pl-template file-name="templates/question_part.mustache">
  <pl-variable name="header">Part 1</pl-variable>
  <pl-variable name="prompt">What is the velocity after $t$ seconds?</pl-variable>
  <pl-variable name="answers-name">v</pl-variable>
  <pl-variable name="label">$v =$</pl-variable>
</pl-template>

<pl-template file-name="templates/question_part.mustache">
  <pl-variable name="header">Part 2</pl-variable>
  <pl-variable name="prompt">How far has the car traveled after $t$ seconds?</pl-variable>
  <pl-variable name="answers-name">d</pl-variable>
  <pl-variable name="label">$d =$</pl-variable>
</pl-template>
```

## Example implementations

- [element/template]
- [element/templateInput]

---

[element/template]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/template
[element/templateInput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/templateInput
