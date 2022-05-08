/* jshint strict: true, immed: true, jquery: true, shadow: true, sub: true, -W040 */
/* globals Browser: true, CodeMirror: true, CodeMirrorSupport: true, CodeStepByStep: true, Cookies: true, Events: true, ga: true, Indenter: true, ion: true, Page: true */

/**
 * This is the JS code to support problem.jsp, the page that shows when
 * the user is working on solving a particular problem.
 *
 * - passes JSHint
 */

(function () {
  "use strict";

  // names I'll use for various UI settings in browser cookies
  // (apparently IE doesn't like underscores in cookie names? wtf ie?)
  const INDENT_SPACE_COUNT_COOKIE_NAME = "codestepbystepindentspacecount";
  const SOUND_COOKIE_NAME = "codestepbystepsound";
  const SYNTAX_HIGHLIGHTING_COOKIE_NAME = "codestepbystepsyntaxhighlighting";
  const TIMED_QUIZ_START_COOKIE_NAME = "codestepbysteptimedquizstart";
  const CHECK_JOB_STATUS_TIMEOUT = 750; // ms between pings to server to check job status
  const SPLIT_PANE_MIN_WIDTH = 1024;

  // sounds to play when user gets problem right
  var SOUNDS_CORRECT = [
    "mario-1up",
    "mario-mushroom",
    "mario-1up",

    // old sounds
    //		"yes.wav",
    //		"excellent.wav",
    //		"cowabunga.wav",
    //		"vader-skills.wav",
    //		"vader-obiwan.wav",
    //		"congratulations.wav",
    //		"mario-i-got-it.wav",
    //		"mario-very-good.wav",
    //		"mario-yippee.wav",
    //		"homer-woohoo.wav",
    //		"homer-smart.wav",
    //		"brilliant.wav"
  ];

  // sounds to play when user gets problem wrong
  const SOUNDS_INCORRECT = [
    "mario-shrink",
    "mario-buzzer",

    // old sounds
    //		"no.wav",
    //		"bogus.wav",
    //		"woooo.wav",
    //		"vader-fail.wav",
    //		"wario-wah.wav",
    //		"homer-doh.wav",
    //		"homer-dont-think-so.wav"
  ];

  var timedQuizTimerID = null;
  var lastSolutionSubmitTimestamp = null;
  var splitPane = null;

  // window load
  $(document).ready(function () {
    // don't set up event handling if AdBlock is enabled
    if (CodeStepByStep.ANGRY_AD_FAIL) {
      return;
    }

    var soundsFolder = Page.clientState("SOUNDS_FOLDER");
    if (soundsFolder) {
      // TODO: don't pre-load these every time (slow)
      var sounds = [{name: "click"}];
      $.each(SOUNDS_CORRECT, function (index, value) {
        sounds.push({
          name: value,
        });
      });
      $.each(SOUNDS_INCORRECT, function (index, value) {
        sounds.push({
          name: value,
        });
      });

      if (ion && ion.sound) {
        ion.sound({
          sounds: sounds,
          volume: 0.5,
          path: soundsFolder,
          preload: true,
          multiplay: true,
        });
      }
    }

    // disable browser's spell-checking, if it has any (FF)
    var $solution = $("#solution, .solution");
    if ($solution.length) {
      $solution.attr("spellcheck", false);

      // handle key presses to listen for Enter or Tab
      $solution.keydown(solutionKeyDown);
      $solution.keypress(solutionKeyPress);
      // $("solutionform").observe("submit", solutionSubmit);
      // Page.makeLinkIntoButton($("shorter"), shorterClick);
      // Page.makeLinkIntoButton($("taller"), tallerClick);
      Page.makeLinkIntoButton($("#indent"), indentClick);
    }

    var $solutionsubmit = $("#solutionsubmit");
    if ($solutionsubmit.length) {
      Page.makeLinkIntoButton($solutionsubmit, solutionSubmitClick);
    }

    var $showheaderlink = $("#showheaderlink");
    if ($showheaderlink.length) {
      $showheaderlink.click(showHeaderClick);
    }

    var $showsolutionlink = $("#showsolutionlink");
    if (true) {
      $showsolutionlink.click(showSolutionClick);
    }

    var $showhintslink = $("#showhintslink");
    if ($showhintslink.length) {
      Page.makeLinkIntoButton($showhintslink, showHintsClick);
    }

    var $clearlink = $("#clearlink");
    if ($clearlink.length) {
      Page.makeLinkIntoButton($clearlink, clearClick);
    }

    var $stripcomments = $("#stripcomments");
    if ($stripcomments.length) {
      $stripcomments.click(stripCommentsClick);
    }

    var $indentspacecount = $("#indentspacecount");
    if ($indentspacecount.length) {
      $indentspacecount.change(updateTabString);
      $indentspacecount.focus(updateTabString);
      $indentspacecount.blur(updateTabString);
      Cookies.makeTextBoxStateful($indentspacecount, INDENT_SPACE_COUNT_COOKIE_NAME);
    }

    // var $controlsarea = $("#controlsarea");
    // if ($controlsarea.length) {
    // 	if (!$("#userinfoarea").length) {
    // 		$controlsarea.hide();
    // 	} else {
    // 		var $syntaxhighlighting = $("#syntaxhighlighting");
    // 		var $sound = $("#sound");
    // 		if ($controlsarea.is(":visible") && $controlsarea.css("display") !== "none") {
    // 			if ($sound.length) {
    // 				Cookies.makeCheckboxStateful($sound, SOUND_COOKIE_NAME);
    // 			}
    // 		} else {
    // 			if ($sound.length) {
    // 				$sound.prop("checked", false);
    // 			}
    // 			if ($syntaxhighlighting.length) {
    // 				$syntaxhighlighting.prop("checked", true);
    // 			}
    // 		}

    // 		if ($syntaxhighlighting.length) {
    // 			Cookies.makeCheckboxStateful($syntaxhighlighting, SYNTAX_HIGHLIGHTING_COOKIE_NAME);
    // 			$syntaxhighlighting.change(codeMirrorToggle);
    // 		}

    // 		// activate CodeMirror library to syntax highlight code editor
    // 		codeMirrorToggle();
    // 	}
    // }

    $("#controlsbutton").click(function () {
      $("#controlsdropdownarea").slideToggle();
      return false;
    });

    // drawing panel problems
    $(".drawingpanelarea")
      .find("img.output")
      .each(function () {
        $(this).mousemove(drawingPanelImageMouseMove);
        $(this).prop("hasMouseObserver", true);
      });

    if ($("#solvedstatus").length) {
      // $("solvedstatus").tooltip(undefined, true, 10000);
    }

    // timed quiz event hookup
    if (isTimedQuiz()) {
      // if the quiz has just begun, record the start time
      if (!Cookies.get(TIMED_QUIZ_START_COOKIE_NAME)) {
        var date = new Date();
        Cookies.set(TIMED_QUIZ_START_COOKIE_NAME, date.getTime().toString(), 1);
      }

      if (!isTimeUp()) {
        updateTimer();
        timedQuizTimerID = setInterval(updateTimer, 5000);
      }
    }

    var $timedquizturninbutton = $("#timedquizturninbutton");
    if ($timedquizturninbutton.length) {
      $timedquizturninbutton.click(turninQuizClick);
    }

    $(".popuplink").each(function () {
      $(this).attr("target", "_blank");
    });

    // save solution text string to make sure value has not changed later
    if ($solution.length) {
      updateTabString();
      $solution.prop("initialValue", getSolutionCode());
    }

    $("#likelink").click(likeLinkClick);
    $("#unlikelink").click(unlikeLinkClick);

    var $revertlink = $("#revertlink");
    if ($revertlink.length) {
      $revertlink.click(revertLinkClick);
    }

    // adds most recent student solution as POST parameter to contact-us page
    $("#contactform").submit(function () {
      var studentsolution = "";
      $("#solutioncontainerdiv")
        .find(".CodeMirror-line")
        .each(function () {
          studentsolution += $(this).text() + "\n";
        });
      $("#studentsolution").val(studentsolution.replace(/\u200B/g, "")); // remove zero-width space characters from code-mirror lines
      $("#problemurl").val(window.location.href); // add current problem page to POST parameters
      $(this).submit();
    });
    $("#contactinstructorform").submit(function () {
      var studentsolution = "";
      $("#solutioncontainerdiv")
        .find(".CodeMirror-line")
        .each(function () {
          studentsolution += $(this).text() + "\n";
        });
      $("#studentsolution").val(studentsolution.replace(/\u200B/g, "")); // remove zero-width space characters from code-mirror lines
      $("#problemurl").val(window.location.href); // add current problem page to POST parameters
      $(this).submit();
    });

    checkSplitPane();
    syntaxHighlightCodeInProblemDescription();

    window.onbeforeunload = windowBeforeUnload;
    window.onresize = windowResize;
  });

  // Checks whether we need to initialize a Split pane with a draggable resizer gutter.
  // https://github.com/nathancahill/split/tree/master/packages/splitjs#options
  function checkSplitPane() {
    // if (!$("#problemarea").hasClass("codeproblem")) {
    // return;   // use split pane only on code-writing problems
    // }
    var width = parseInt(document.body.clientWidth || 0, 10);
    if (width >= SPLIT_PANE_MIN_WIDTH) {
      if (!splitPane) {
        splitPane = Split(["#presolutionarea", "#solutionarea"], {
          gutter: function (index, direction) {
            var gutter = document.createElement("div");
            gutter.className = `split-gutter split-gutter-${direction}`;
            var span = document.createElement("span");
            span.textContent = ". . .";
            gutter.appendChild(span);
            return gutter;
          },
          gutterSize: 7,
          minSize: "20%",
        });
      }
    } else {
      if (splitPane) {
        splitPane.destroy();
        splitPane = null;
      }
    }
  }

  // Initializes the CodeMirror syntax highlighter on the main solution text box.
  function codeMirrorInit() {
    if (typeof CodeMirror != "function") {
      return false;
    }

    $("#solution, .solution").each(function (index) {
      var solutionTextArea = this;

      // figure out right "mode" (language) to use for highlighting
      var language = $(solutionTextArea).data("language");
      if (!language) {
        language = getProgrammingLanguage();
      }
      var mode = CodeMirrorSupport.getMode(language);

      // <div id="embedded">true</div> -> true
      var embedded = Page.isEmbedded();

      // give the CodeMirror text box focus unless it is far down the screen
      // var screenHeight = window.innerHeight || screen.availHeight || $(window).height() || 0;
      // var tallDescription = $("#description").height() >= screenHeight / 2;
      // var codeMirrorAutoFocus = !embedded && index == 0 && !tallDescription;

      // http://codemirror.net/doc/manual.html
      var options = {
        extraKeys: {
          // set up ^S hotkeys to run/save/submit code;
          "Ctrl-S": solutionSubmitClick,
          "Cmd-S": solutionSubmitClick,
          Up: solutionUpArrowClick,
          Down: solutionDownArrowClick,
        },
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-lint-markers"],
        mode: mode,
        value: solutionTextArea.value,
      };

      if (!embedded) {
        options.viewportMargin = Infinity; // resize vertically if user types more lines
      }

      CodeMirrorSupport.turnOn(solutionTextArea, options);
    });
  }

  // Turns CodeMirror syntax highlighting on/off as checkbox is checked.
  function codeMirrorToggle() {
    if ($("#syntaxhighlighting").prop("checked")) {
      codeMirrorInit();
    } else {
      CodeMirrorSupport.turnOffAll();
    }
  }

  /*
   * draws mouse position within drawingpanel output image
   */
  function drawingPanelImageMouseMove(event) {
    var x = typeof event.pageX == "number" ? event.pageX : event.clientX;
    var y = typeof event.pageY == "number" ? event.pageY : event.clientY;
    var table = this.closest("table");
    if (!table) {
      return;
    }
    var mousePosArea = $(table).find(".drawingpanelmouseposition");
    if (!mousePosArea) {
      return;
    }
    var tableX = parseInt($(this).offset().left);
    var tableY = parseInt($(this).offset().top);
    x -= tableX;
    y -= tableY;
    mousePosArea.text("(" + x + ", " + y + ")");
  }

  // returns the currently typed solution code in the solution text box / CodeMirror box;
  // if this is a multi-language problem, returns all languages' solutions concatenated and
  // surrounded by special comment delimiters
  function getSolutionCode() {
    if (isMultiLanguageProblem()) {
      // build a concatenated string of all languages' solutions together
      var surroundLanguageText = function (solution, language) {
        var commentStart = Page.clientState(language.toLowerCase() + "commentstart") || "/*";
        var commentEnd = Page.clientState(language.toLowerCase() + "commentend") || "*/";
        return (
          "" +
          // comment BEGIN header
          (commentStart + " !!! BEGIN " + language + " SOLUTION CODE !!! " + commentEnd).trim() +
          "\n" +
          // student's solution itself
          solution +
          // make sure solution ends with a newline
          (solution.endsWith("\n") ? "" : "\n") +
          // comment END header
          (commentStart + " !!! END " + language + " SOLUTION CODE !!! " + commentEnd).trim() +
          "\n\n"
        );
      };

      var returnValue = "";
      if (CodeMirrorSupport.isEnabled()) {
        CodeMirrorSupport.getAllCodeMirrors().forEach(function (codeMirror) {
          var language = codeMirror.getLanguage();
          var solution = codeMirror.getValue();
          returnValue += surroundLanguageText(solution, language);
        });
      } else {
        $("#solution, .solution").each(function (index) {
          var textarea = this;
          var language = textarea.data("language");
          var solution = textarea.value;
          returnValue += surroundLanguageText(solution, language);
        });
      }
      return returnValue.rtrim();
    } else {
      // single-language problem; return text of the first (and only) solution textarea
      if (CodeMirrorSupport.isEnabled()) {
        return CodeMirrorSupport.getCodeMirror().getValue();
      } else {
        return $("#solution, .solution").val();
      }
    }
  }

  function setSolutionCode(code) {
    if (isMultiLanguageProblem()) {
      // similar to code of CodeProblem.splitSolutionByLanguage
      var lines = code.split(/\r?\n/);
      var currentLanguage = "";
      var currentSolution = "";
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.match(/!!! BEGIN .* SOLUTION CODE !!!/)) {
          currentLanguage = line.replace(/.*!!! BEGIN (.*) SOLUTION CODE !!!.*/, "$1").toLowerCase();
        } else if (currentLanguage) {
          if (line.match(/!!! END .* SOLUTION CODE !!!/)) {
            // end of solution; store into text area
            setSolutionCodeForLanguage(currentLanguage, currentSolution);
            currentLanguage = "";
            currentSolution = "";
          } else {
            // concatenate into current solution
            currentSolution += (currentSolution.length > 0 ? "\n" : "") + line;
          }
        }
      }
    } else {
      // single-language problem; set the text of the first (and only) solution textarea
      if (CodeMirrorSupport.isEnabled()) {
        // insert into CodeMirror text box
        CodeMirrorSupport.getCodeMirror().setValue(code);
      } else {
        // insert into standard textarea
        $("#solution, .solution").val(code);
      }
    }
  }

  /*
   * Sets solution code visible in text box for the given language.
   */
  function setSolutionCodeForLanguage(language, code) {
    language = language.toLowerCase();
    if (CodeMirrorSupport.isEnabled()) {
      // insert into CodeMirror text box
      CodeMirrorSupport.getAllCodeMirrors().forEach(function (codeMirror) {
        if (codeMirror.getLanguage().toLowerCase() == language) {
          codeMirror.setValue(code);
        }
      });
    } else {
      // insert into standard textarea
      $("#solution" + language + ", .solution" + language).val(code);
    }
  }

  /**
   * Called when the Clear button is pressed.
   * Erases all text in solution input boxes on the page.
   */
  function clearClick(event) {
    if (!confirm("Are you sure you want to clear all solution text on the current page?\n" + "Any previous solution you submitted to the server is still saved.")) {
      return false;
    }

    $("#solution, .expressionanswer").each(function () {
      $(this).val("");
    });

    $(".multiplechoiceanswer").each(function () {
      $(this).attr("checked", false);
    });

    return Events.abort(event);
  }

  /**
   * If there is a timed quiz in progress, this function is called every minute.
   * If the student still has time to complete the quiz, this function updates
   * the timer with the correct time remaining.  If this function is called when
   * the student taken the allotted amount of time, their timed quiz client state
   * is removed (a cookie), the timer is cleared, and they are asked if they would
   * like to turnin the quiz.
   */
  function updateTimer() {
    if (isTimeUp()) {
      $("#minsremaining").text(0);
      $("#hoursremaining").text(0);

      stopTimedQuiz();

      var goToResults = confirm("Your time is up!  Would you like to stop " + 'working and go to the results page?  If you click "Cancel", ' + "you can continue working as long as you want and we'll tell you " + 'the total time you used when you click "Turn quiz in!".');
      if (goToResults) {
        window.location.href = "timedquizresults.jsp?category=" + window.location.search.toQueryParams()["category"];
      }
    } else {
      var msLeft = msLeftToCompleteQuiz();
      var secsLeft = Math.round(msLeft / 1000);
      var minsLeft = Math.min(59, Math.ceil((secsLeft % 3600) / 60));
      var hoursLeft = Math.floor(secsLeft / 3600);
      $("#minsremaining").text(minsLeft);
      $("#hoursremaining").text(hoursLeft);
    }
  }

  function hideDescriptionClick(event) {
    if ($(this).prop("disabled")) {
      return Events.abort(event);
    }
    $(this).disableLink();
    var that = $(this);

    var callback = function () {
      that.enableLink();
    };

    var $description = $("#description");
    $description.slideToggle(callback);

    return Events.abort(event);
  }

  function getCheckJobStatusTimeout() {
    return CHECK_JOB_STATUS_TIMEOUT;
  }

  function getProblemID() {
    var $problemid = $("#problemid");
    var $solutionform = $("#solutionform");
    if ($problemid.length) {
      return parseInt($problemid.html());
    } else if ($solutionform.length) {
      return parseInt($solutionform[0].querySelector(".problemid").value);
    } else {
      return -1;
    }
  }

  /*
   * Returns the programming language used by this problem, as reported from the
   * client state or the span with id="language" injected on the server end.
   */
  function getProgrammingLanguage() {
    if (Page.hasClientState("language")) {
      return Page.clientState("language");
    } else {
      var $language = $("#language");
      var language = ($language && $language.html().toLowerCase().trim()) || "text";
      return language;
    }
  }

  /*
   * Returns the programming languages used by this problem, as reported from the client state.
   */
  function getProgrammingLanguages() {
    return Page.clientState("languages");
  }

  function indentClick(event) {
    if ($(this).prop("disabled")) {
      return Events.abort(event);
    }
    if (!$("#solutionsubmit").hasClass("HTML")) {
      updateTabString();
      var solutionCode = getSolutionCode();
      if (shouldIndentSolutionCode()) {
        solutionCode = Indenter.indent(solutionCode);
      }
      setSolutionCode(solutionCode);
    }
    return Events.abort(event);
  }

  function isCodeProblem() {
    var $problemarea = $("#problemarea");
    return $problemarea && $problemarea.hasClass("codeproblem");
  }

  function isAssertionProblem() {
    return $("table.assertiontable").length > 0;
  }

  function isExpressionProblem() {
    return $("table.expressiontable").length > 0;
  }

  // mechanical = any non-coding problem (expressions, mult. choice, assertions)
  function isMechanicalProblem() {
    return isExpressionProblem() || isAssertionProblem() || isMultipleChoiceProblem();
  }

  function isMultiLanguageProblem() {
    return CodeMirrorSupport.isMultiple() || $("#solution, .solution").length >= 2;
  }

  function isMultipleChoiceProblem() {
    return $(".multiplechoice").length > 0;
  }

  /**
   * Whether we are in a timed quiz right now.
   */
  function isTimedQuiz() {
    return $("#timearea").length > 0;
  }

  /**
   * Returns whether or not a timed quiz's time is up.  If the problem is not a
   * part of a timed quiz, true is returned.
   * @returns {Boolean}
   */
  function isTimeUp() {
    return msLeftToCompleteQuiz() <= 0;
  }

  function likeLinkClick(event) {
    $("#likeform").ajaxSubmit({
      success: function (data) {
        var $likecountnumber = $("#likecountnumber");
        if ($likecountnumber.length) {
          $likecountnumber.html(data);
        }

        var $unlikelink = $("#unlikelinksection");
        if ($unlikelink.length) {
          $unlikelink.enableLink();
          $unlikelink.css("display", "inline");
        }

        $("#likelinksection").hide();
      },
      error: Page.ajaxFailure,
    });

    return Events.abort(event);
  }

  function unlikeLinkClick(event) {
    $("#unlikeform").ajaxSubmit({
      success: function (data) {
        var $likecountnumber = $("#likecountnumber");
        if ($likecountnumber.length) {
          $likecountnumber.html(data);
        }

        var $likelink = $("#likelinksection");
        if ($likelink.length) {
          $likelink.enableLink();
          $likelink.css("display", "inline");
        }

        $("#unlikelinksection").hide();
      },
      error: Page.ajaxFailure,
    });

    return Events.abort(event);
  }

  /**
   * This function returns the number of milliseconds left in a timed quiz.
   * -1 is returned if timed quiz is over or problem is not a part of a timed
   * quiz.
   */
  function msLeftToCompleteQuiz() {
    var startMs = Cookies.get(TIMED_QUIZ_START_COOKIE_NAME);
    var timeToComplete = parseInt(Page.getTextContent($("#timetocomplete")));

    if (!startMs || !timeToComplete) {
      return -1;
    }

    var now = new Date();
    var msLeft = timeToComplete * 60 * 1000 - (now.getTime() - startMs);

    return msLeft;
  }

  // Play sounds if enabled
  function playSound(soundArray) {
    var $sound = $("#sound");
    if ($sound.length && $sound.prop("checked") && !isTimedQuiz()) {
      var randomSound = soundArray[parseInt(Math.random() * soundArray.length)];
      try {
        ion.sound.play(randomSound);
      } catch (e) {
        console.log(e);
      }
    }
  }

  // This function makes school-specific changes to Java code as needed.
  // NOTE: Keep this code in sync with JavaCodeProblem.java preprocessSolutionCode method!
  function preprocessSolutionCode(code) {
    var language = getProgrammingLanguage();
    if (language.toLowerCase() == "java") {
      // modify Java code to suit the school's preferences
      var problemType = Page.clientState("problemtype");
      if (Page.clientState("dislikestaticmethods") && (problemType == "function" || problemType == "method")) {
        if (code.contains("public static ")) {
          code = code.replace(/public static /g, "public ");
        }
      }

      if (Page.clientState("stanfordconsole")) {
        var prints = code.contains("System.out.print");
        var hasMain = code.contains(/public (?:static )?void main\(String\[\] args\)/);
        if (prints) {
          code = code.replace(/System\.out\.print/g, "print");
        }
        if (hasMain) {
          code = code.replace(/public (?:static )?void main\(String\[\] args\)/g, "public void run()");

          if ((prints && (problemType == "class" || problemType == "partialclass" || problemType == "inheritanceclass")) || code.contains("void run()") || code.contains("void main(")) {
            // let's also assume that it is a console program; janky but it works well enough
            code = code.replace(/public[ ]+class[ ]+([a-zA-Z0-9_]{1,255}) \{/g, "public class $1 extends ConsoleProgram {");
          }
        }
      }
    }

    return code;
  }

  // This function is called when the user solved a problem correctly.
  function problemCorrect() {
    // play a congratulatory sound
    playSound(SOUNDS_CORRECT);
  }

  // This function is called when the user tries to solve a problem but fails.
  function problemIncorrect() {
    // play a mocking sound
    playSound(SOUNDS_INCORRECT);
  }

  function revertLinkClick() {
    if (!confirm("This will reset the solution text to its initial state from when you first started the problem.  Are you sure?")) {
      return;
    }

    if (isMultiLanguageProblem()) {
      var languages = getProgrammingLanguages();
      for (var i = 0; i < languages.length; i++) {
        var language = languages[i];
        var initialValue = Page.clientState("initialvaluereset" + language);
        if (initialValue && initialValue.length > 0) {
          setSolutionCodeForLanguage(language, initialValue);
        }
      }
      setSolutionCode(Page.clientState("initialvaluereset"));
    } else {
      setSolutionCode(Page.clientState("initialvaluereset"));
    }
  }

  function resizeSolution(rows) {
    rows = Math.max(rows, 3);
    $("#solution, .solution").each(function (index) {
      this.rows = rows;
    });
  }

  function getUserType() {
    var userType = "";
    var $userimagearea = $("#userimagearea");
    if ($userimagearea.length) {
      var userTypeSpan = $userimagearea.find(".usertype");
      if (userTypeSpan) {
        userType = userTypeSpan.html().trim();
      }
    }
    return "administrator";
  }

  function shouldIndentSolutionCode() {
    var $indent = $("#indent");
    return !!($indent.length > 0 && $indent.is(":visible") && $indent && $indent.linkIsEnabled());
  }

  function showHeaderClick(event) {
    Events.abort(event);
    if ($(this).prop("disabled")) {
      return Events.abort(event);
    }

    if (Page.hasClientState("showmetheheader")) {
      var header = Page.clientState("showmetheheader");
      if (header) {
        if (getUserType() != "administrator" && !confirm("This feature will reveal the correct header for the method/function for this problem, erasing any text you've currently typed. Are you sure?")) {
          return Events.abort(event);
        }
        setSolutionCode(header);
      }
    }
    $("#controlsdropdownarea").slideToggle(); // hide drop-down menu
  }

  function showSolutionClick(event) {
    Events.abort(event);
    if ($(this).prop("disabled")) {
      return Events.abort(event);
    }

    var $solvedstatus = $("#solvedstatus");
    var unsolved = $solvedstatus.hasClass("unsolved");
    // if (unsolved && getUserType() != "administrator" && !confirm("If you peek at the solution, we won't count this problem toward your total.  Are you sure?")) {
    //   return Events.abort(event);
    // }

    $(this).disableLink();

    // fetch solution using Ajax
    // flag them as a dirty stinking cheater
    // if (unsolved) {
    //   $("#cheated").val("1");
    // }

    $("#solutionloading").css("visibility", "visible");

    // contact the server to get the solutions and put them on the page
    var that = $(this);
    $.ajax(this.href, {
      method: "get",
      dataType: "xml",
      success: function (data) {
        if (!data) {
          return;
        }

        var solutions = data.getElementsByTagName("solution");
        if (isCodeProblem()) {
          // place the first solution's text into the solution text box;
          // place the others into a drop-down select box
          var solutionText = Page.getTextContent(solutions.item(0)).trim();

          // don't auto-indent HTML code (wrong indentation algorithm;
          // looks for brackets)
          if (shouldIndentSolutionCode()) {
            solutionText = Indenter.indent(solutionText);
          }
          setSolutionCode(solutionText);

          if (solutions.length > 1) {
            // multiple solutions; show them in a combo box
            var $cheatarea = $("#cheatarea");
            if (!$("#solutions").length && $cheatarea.length) {
              var select = $(document.createElement("select"));
              select.attr("id", "solutions");
              select.change(solutionSelectChange);
              for (var i = 0; i < solutions.length; i++) {
                var option = $(document.createElement("option"));
                option.val(Page.getTextContent(solutions.item(i)).trim());

                var name = solutions.item(i).getAttribute("name");
                option.text(name);
                select.append(option);
              }

              $cheatarea.find("#showsolutionlink").remove();
              $cheatarea.append(select);
            }
          }
        } else if (isMechanicalProblem()) {
          // mechanical problems' solutions should be inserted directly into
          // their respective input elements  (elements' IDs are equal to
          // the problem names)

          // example:
          // <solutions>
          //	 <solution name="mechanical1">answer1</solution>
          //	 <solution name="mechanical2">answer0</solution>
          // </solutions>
          var multiple = isMultipleChoiceProblem();

          for (var i = 0; i < solutions.length; i++) {
            var solutionNameRaw = solutions.item(i).getAttribute("name"); // e.g. "mechanical1[]0"
            var questionName = "#" + solutionNameRaw.replace(/[\[\]].*/g, ""); // e.g. "#mechanical1"
            var $question = $(questionName);
            if ($question.length === 0) {
              continue;
            }

            var answer = Page.getTextContent(solutions.item(i));
            if (multiple) {
              // multiple-choice problem with radio buttons, checkboxes, or select/options of answers
              var tag = ("" + $question[0].tagName).toLowerCase();
              if (tag == "input" && (!$question.attr("type") || $question.attr("type") == "text")) {
                // some MC problems have input text boxes for some of their expressions
                $question.val(answer);
              } else {
                // try radio/checkbox (common case for MC)
                var $checkboxes = $(questionName + " input[type=checkbox]");
                if ($checkboxes.length > 0 && solutionNameRaw.endsWith("[]0")) {
                  // first uncheck all (checkboxes only), if this is first checkbox answer in sequence
                  $checkboxes.prop("checked", false);
                }

                // now check the one(s) that should be checked
                var $inputs = $(questionName + " input[value='" + answer + "']");
                if ($inputs.length > 0) {
                  $inputs.prop("checked", true);
                } else {
                  // 'compact' multiple choice questions use select/option rather than inputs
                  var $options = $(questionName + " option[value='" + answer + "']");
                  if ($options.length > 0) {
                    $options.prop("selected", true);
                  }
                }
              }
            } else {
              // standard expression problem with input type="text" for typing the answer
              $question.val(answer);
            }
          }
        }

        if ($solvedstatus.length && $solvedstatus.hasClass("unsolved")) {
          $solvedstatus.removeClass();
          $solvedstatus.addClass("fas fa-stop-circle cheated-icon cheated");
          $solvedstatus.attr("title", "You have solved this problem, but you peeked at the answer first.");
          var $solvedstatustext = $("#solvedstatustext");
          if ($solvedstatustext.length) {
            $solvedstatustext.text("peeked");
          }
        }

        that.enableLink();
        $("#solutionloading").css("visibility", "hidden");
      },
      error: Page.ajaxFailure,
    });

    $("#controlsdropdownarea").slideToggle(); // hide drop-down menu
    return Events.abort(event);
  }

  function showHintsClick(event) {
    var $hintsarea = $("#hintsarea");
    if (!$hintsarea.length) {
      return;
    }

    $hintsarea.show();
    var processed = false;
    $("#hintsarea")
      .find(".hint")
      .each(function () {
        if (!processed && !$(this).is(":visible")) {
          $(this).fadeIn();
          processed = true;
        }
      });

    return Events.abort(event);
  }

  /* function sliderChange(value) {
		var opacity = Math.max(0.0, Math.min(1.0, value / 100.0));
		$("htmlexpectedoutput").setOpacity(opacity);

		// dim the actual correct answer, sometimes
		if (opacity >= 0.8) {
			$("htmlactualoutput").setOpacity(1.0 - opacity);
		} else if (opacity >= 0.5) {
			$("htmlactualoutput").setOpacity(1.2 - opacity);
		} else {
			$("htmlactualoutput").setOpacity(1.0);
		}
	} */

  function solutionAjaxCommon() {
    var enableButton = function () {
      $("#solutionsubmit").enableLink();
    };

    // $("loadingarea").hide();
    $("#loadingarea").hide();

    // hide the "Contacting server and running tests" message
    var $testresultsloadingarea = $("#testresultsloadingarea");
    if ($testresultsloadingarea.length) {
      if ($testresultsloadingarea.is(":visible")) {
        $testresultsloadingarea.fadeOut();
      }
    }

    var $testresultsarea = $("#testresultsarea");
    if ($testresultsarea.length) {
      $testresultsarea.fadeIn(enableButton);
    }
    $("#loading").fadeOut();
    $("#solutionsubmit").enableLink();
  }

  /**
   * Called when the user has correctly solved another problem.
   * Updates the page to contain new information about how many problems the user
   * has solved, etc.
   */
  function updateSolved() {
    // update user's total problems solved, if applicable
    var $usertotalsolved = $("#usertotalsolved");
    if ($usertotalsolved.length) {
      var $newtotalsolved = $("#newtotalsolved");

      if ($newtotalsolved.length) {
        $usertotalsolved.html($newtotalsolved.html());
      }
      var $solvedstatus = $("#solvedstatus");
      if ($solvedstatus && $solvedstatus.hasClass("unsolved")) {
        $solvedstatus.removeClass();
        $solvedstatus.addClass("fa fa-check-circle-o pass-icon solved");
        $solvedstatus.attr("title", "Already solved; good work!");
        // $("solvedcount").appear();

        var $solvedcountnumber = $("#solvedcountnumber");
        if ($solvedcountnumber.length) {
          $solvedcountnumber.text(parseInt($solvedcountnumber.html()) + 1);
        }
        var $solvedstatustext = $("#solvedstatustext");
        if ($solvedstatustext.length) {
          $solvedstatustext.text("You have solved this problem; good work!");
        }
      }
    }
  }

  // Runs when student's code has been tested and results are now shown in #testresultsarea.
  function solutionAjaxSuccess(data) {
    console.log(data);
    let datum = `



	













<script type="text/javascript">
(function() {
	if (typeof window.__csbsClientState === 'undefined') { window.__csbsClientState = {}; }
	window.__csbsClientState["achievements"] = [];
	window.__csbsClientState["achievementsurl"] = "/achievement/view";
})();
</script>


<span id="testresultsclosearea">
	<a style="font-size: 16pt; margin-right: 5px;" title="Close test results" onclick="$('#testresultsarea *').fadeOut();"><i class="fa fa-times"></i></a>
</span>





	
	<p id="passcountmessage">
		<span id="passcountmessagespan" class="passedall">
			<i class="fa fa-check-circle pass-icon"></i>
			<strong>You passed 1 of 1 tests.</strong>
	
		
	



	

	

	
	
		
			
			<div id="testresultsholder">
				<div id="testresults">
					
					
						
						
						
							<div class="testcase pass">
								<div class="problemnumberandname testresultrow">
									<span class="probleminfoheading"><span class="problemnumber">test #1:</span></span>
									<span class="problemname"><span>output</span></span>
								</div>
								
								
								
	
								
									
									
										<div class="testresultrow">
											<span class="probleminfoheading">console output:</span>
											<span class="problemactual problemoutput">&nbsp;&nbsp;_______&nbsp;
&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\
/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\
-&quot;-'-&quot;-'-&quot;-
\&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/
&nbsp;\_______/</span>
										</div>
									
								
								
								
								
								
								
								
								
								
								
								
	
								
								
								
									<div class="testresultrow problemresult">
										
										<span class="probleminfoheading">result:</span>
										<span class="problemtestresult">
											<i class="fa fa-check-circle pass-icon"></i>
											pass
										</span>
									</div>
								
						
									
								
								
								
							</div>
						
					 
					
					
				</div> 
			</div>
		 
	 
 

 




<style type="text/css">
/* inserted source code of file toastr.css */
/*
 * Note that this is toastr v2.1.3, the "latest" version in url has no more maintenance,
 * please go to https://cdnjs.com/libraries/toastr.js and pick a certain version you want to use,
 * make sure you copy the url from the website since the url may change between versions.
 * */
.toast-title {
  font-weight: bold;
}
.toast-message {
  -ms-word-wrap: break-word;
  word-wrap: break-word;
}
.toast-message a,
.toast-message label {
  color: #FFFFFF;
}
.toast-message a:hover {
  color: #CCCCCC;
  text-decoration: none;
}
.toast-close-button {
  position: relative;
  right: -0.3em;
  top: -0.3em;
  float: right;
  font-size: 20px;
  font-weight: bold;
  color: #FFFFFF;
  -webkit-text-shadow: 0 1px 0 #ffffff;
  text-shadow: 0 1px 0 #ffffff;
  opacity: 0.8;
  -ms-filter: progid:DXImageTransform.Microsoft.Alpha(Opacity=80);
  filter: alpha(opacity=80);
  line-height: 1;
}
.toast-close-button:hover,
.toast-close-button:focus {
  color: #000000;
  text-decoration: none;
  cursor: pointer;
  opacity: 0.4;
  -ms-filter: progid:DXImageTransform.Microsoft.Alpha(Opacity=40);
  filter: alpha(opacity=40);
}
.rtl .toast-close-button {
  left: -0.3em;
  float: left;
  right: 0.3em;
}
/*Additional properties for button version
 iOS requires the button element instead of an anchor tag.
 If you want the anchor version, it requires \`href="#"\`.*/
button.toast-close-button {
  padding: 0;
  cursor: pointer;
  background: transparent;
  border: 0;
  -webkit-appearance: none;
}
.toast-top-center {
  top: 0;
  right: 0;
  width: 100%;
}
.toast-bottom-center {
  bottom: 0;
  right: 0;
  width: 100%;
}
.toast-top-full-width {
  top: 0;
  right: 0;
  width: 100%;
}
.toast-bottom-full-width {
  bottom: 0;
  right: 0;
  width: 100%;
}
.toast-top-left {
  top: 12px;
  left: 12px;
}
.toast-top-right {
  top: 12px;
  right: 12px;
}
.toast-bottom-right {
  right: 12px;
  bottom: 12px;
}
.toast-bottom-left {
  bottom: 12px;
  left: 12px;
}
#toast-container {
  position: fixed;
  z-index: 999999;
  pointer-events: none;
  /*overrides*/
}
#toast-container * {
  -moz-box-sizing: border-box;
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
}
#toast-container > div {
  position: relative;
  pointer-events: auto;
  overflow: hidden;
  margin: 0 0 6px;
  padding: 15px 15px 15px 50px;
  width: 300px;
  -moz-border-radius: 3px 3px 3px 3px;
  -webkit-border-radius: 3px 3px 3px 3px;
  border-radius: 3px 3px 3px 3px;
  background-position: 15px center;
  background-repeat: no-repeat;
  -moz-box-shadow: 0 0 12px #999999;
  -webkit-box-shadow: 0 0 12px #999999;
  box-shadow: 0 0 12px #999999;
  color: #FFFFFF;
  opacity: 0.8;
  -ms-filter: progid:DXImageTransform.Microsoft.Alpha(Opacity=80);
  filter: alpha(opacity=80);
}
#toast-container > div.rtl {
  direction: rtl;
  padding: 15px 50px 15px 15px;
  background-position: right 15px center;
}
#toast-container > div:hover {
  -moz-box-shadow: 0 0 12px #000000;
  -webkit-box-shadow: 0 0 12px #000000;
  box-shadow: 0 0 12px #000000;
  opacity: 1;
  -ms-filter: progid:DXImageTransform.Microsoft.Alpha(Opacity=100);
  filter: alpha(opacity=100);
  cursor: pointer;
}
#toast-container > .toast-info {
  background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGwSURBVEhLtZa9SgNBEMc9sUxxRcoUKSzSWIhXpFMhhYWFhaBg4yPYiWCXZxBLERsLRS3EQkEfwCKdjWJAwSKCgoKCcudv4O5YLrt7EzgXhiU3/4+b2ckmwVjJSpKkQ6wAi4gwhT+z3wRBcEz0yjSseUTrcRyfsHsXmD0AmbHOC9Ii8VImnuXBPglHpQ5wwSVM7sNnTG7Za4JwDdCjxyAiH3nyA2mtaTJufiDZ5dCaqlItILh1NHatfN5skvjx9Z38m69CgzuXmZgVrPIGE763Jx9qKsRozWYw6xOHdER+nn2KkO+Bb+UV5CBN6WC6QtBgbRVozrahAbmm6HtUsgtPC19tFdxXZYBOfkbmFJ1VaHA1VAHjd0pp70oTZzvR+EVrx2Ygfdsq6eu55BHYR8hlcki+n+kERUFG8BrA0BwjeAv2M8WLQBtcy+SD6fNsmnB3AlBLrgTtVW1c2QN4bVWLATaIS60J2Du5y1TiJgjSBvFVZgTmwCU+dAZFoPxGEEs8nyHC9Bwe2GvEJv2WXZb0vjdyFT4Cxk3e/kIqlOGoVLwwPevpYHT+00T+hWwXDf4AJAOUqWcDhbwAAAAASUVORK5CYII=") !important;
}
#toast-container > .toast-error {
  background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAHOSURBVEhLrZa/SgNBEMZzh0WKCClSCKaIYOED+AAKeQQLG8HWztLCImBrYadgIdY+gIKNYkBFSwu7CAoqCgkkoGBI/E28PdbLZmeDLgzZzcx83/zZ2SSXC1j9fr+I1Hq93g2yxH4iwM1vkoBWAdxCmpzTxfkN2RcyZNaHFIkSo10+8kgxkXIURV5HGxTmFuc75B2RfQkpxHG8aAgaAFa0tAHqYFfQ7Iwe2yhODk8+J4C7yAoRTWI3w/4klGRgR4lO7Rpn9+gvMyWp+uxFh8+H+ARlgN1nJuJuQAYvNkEnwGFck18Er4q3egEc/oO+mhLdKgRyhdNFiacC0rlOCbhNVz4H9FnAYgDBvU3QIioZlJFLJtsoHYRDfiZoUyIxqCtRpVlANq0EU4dApjrtgezPFad5S19Wgjkc0hNVnuF4HjVA6C7QrSIbylB+oZe3aHgBsqlNqKYH48jXyJKMuAbiyVJ8KzaB3eRc0pg9VwQ4niFryI68qiOi3AbjwdsfnAtk0bCjTLJKr6mrD9g8iq/S/B81hguOMlQTnVyG40wAcjnmgsCNESDrjme7wfftP4P7SP4N3CJZdvzoNyGq2c/HWOXJGsvVg+RA/k2MC/wN6I2YA2Pt8GkAAAAASUVORK5CYII=") !important;
}
#toast-container > .toast-success {
  background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAADsSURBVEhLY2AYBfQMgf///3P8+/evAIgvA/FsIF+BavYDDWMBGroaSMMBiE8VC7AZDrIFaMFnii3AZTjUgsUUWUDA8OdAH6iQbQEhw4HyGsPEcKBXBIC4ARhex4G4BsjmweU1soIFaGg/WtoFZRIZdEvIMhxkCCjXIVsATV6gFGACs4Rsw0EGgIIH3QJYJgHSARQZDrWAB+jawzgs+Q2UO49D7jnRSRGoEFRILcdmEMWGI0cm0JJ2QpYA1RDvcmzJEWhABhD/pqrL0S0CWuABKgnRki9lLseS7g2AlqwHWQSKH4oKLrILpRGhEQCw2LiRUIa4lwAAAABJRU5ErkJggg==") !important;
}
#toast-container > .toast-warning {
  background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGYSURBVEhL5ZSvTsNQFMbXZGICMYGYmJhAQIJAICYQPAACiSDB8AiICQQJT4CqQEwgJvYASAQCiZiYmJhAIBATCARJy+9rTsldd8sKu1M0+dLb057v6/lbq/2rK0mS/TRNj9cWNAKPYIJII7gIxCcQ51cvqID+GIEX8ASG4B1bK5gIZFeQfoJdEXOfgX4QAQg7kH2A65yQ87lyxb27sggkAzAuFhbbg1K2kgCkB1bVwyIR9m2L7PRPIhDUIXgGtyKw575yz3lTNs6X4JXnjV+LKM/m3MydnTbtOKIjtz6VhCBq4vSm3ncdrD2lk0VgUXSVKjVDJXJzijW1RQdsU7F77He8u68koNZTz8Oz5yGa6J3H3lZ0xYgXBK2QymlWWA+RWnYhskLBv2vmE+hBMCtbA7KX5drWyRT/2JsqZ2IvfB9Y4bWDNMFbJRFmC9E74SoS0CqulwjkC0+5bpcV1CZ8NMej4pjy0U+doDQsGyo1hzVJttIjhQ7GnBtRFN1UarUlH8F3xict+HY07rEzoUGPlWcjRFRr4/gChZgc3ZL2d8oAAAAASUVORK5CYII=") !important;
}
#toast-container.toast-top-center > div,
#toast-container.toast-bottom-center > div {
  width: 300px;
  margin-left: auto;
  margin-right: auto;
}
#toast-container.toast-top-full-width > div,
#toast-container.toast-bottom-full-width > div {
  width: 96%;
  margin-left: auto;
  margin-right: auto;
}
.toast {
  background-color: #030303;
}
.toast-success {
  background-color: #51A351;
}
.toast-error {
  background-color: #BD362F;
}
.toast-info {
  background-color: #2F96B4;
}
.toast-warning {
  background-color: #F89406;
}
.toast-progress {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 4px;
  background-color: #000000;
  opacity: 0.4;
  -ms-filter: progid:DXImageTransform.Microsoft.Alpha(Opacity=40);
  filter: alpha(opacity=40);
}
/*Responsive Design*/
@media all and (max-width: 240px) {
  #toast-container > div {
    padding: 8px 8px 8px 50px;
    width: 11em;
  }
  #toast-container > div.rtl {
    padding: 8px 50px 8px 8px;
  }
  #toast-container .toast-close-button {
    right: -0.2em;
    top: -0.2em;
  }
  #toast-container .rtl .toast-close-button {
    left: -0.2em;
    right: 0.2em;
  }
}
@media all and (min-width: 241px) and (max-width: 480px) {
  #toast-container > div {
    padding: 8px 8px 8px 50px;
    width: 18em;
  }
  #toast-container > div.rtl {
    padding: 8px 50px 8px 8px;
  }
  #toast-container .toast-close-button {
    right: -0.2em;
    top: -0.2em;
  }
  #toast-container .rtl .toast-close-button {
    left: -0.2em;
    right: 0.2em;
  }
}
@media all and (min-width: 481px) and (max-width: 768px) {
  #toast-container > div {
    padding: 15px 15px 15px 50px;
    width: 25em;
  }
  #toast-container > div.rtl {
    padding: 15px 50px 15px 15px;
  }
}

</style>

<script type="text/javascript">
// <![CDATA[
// inserted source code of file toastr.js:
/*
 * Toastr
 * Copyright 2012-2015
 * Authors: John Papa, Hans Fjällemark, and Tim Ferrell.
 * All Rights Reserved.
 * Use, reproduction, distribution, and modification of this code is subject to the terms and
 * conditions of the MIT license, available at http://www.opensource.org/licenses/mit-license.php
 *
 * ARIA Support: Greta Krafsig
 *
 * Project: https://github.com/CodeSeven/toastr
 */
/* global define */
(function (define) {
    define(['jquery'], function ($) {
        return (function () {
            var $container;
            var listener;
            var toastId = 0;
            var toastType = {
                error: 'error',
                info: 'info',
                success: 'success',
                warning: 'warning'
            };

            var toastr = {
                clear: clear,
                remove: remove,
                error: error,
                getContainer: getContainer,
                info: info,
                options: {},
                subscribe: subscribe,
                success: success,
                version: '2.1.3',
                warning: warning
            };

            var previousToast;

            return toastr;

            ////////////////

            function error(message, title, optionsOverride) {
                return notify({
                    type: toastType.error,
                    iconClass: getOptions().iconClasses.error,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function getContainer(options, create) {
                if (!options) { options = getOptions(); }
                $container = $('#' + options.containerId);
                if ($container.length) {
                    return $container;
                }
                if (create) {
                    $container = createContainer(options);
                }
                return $container;
            }

            function info(message, title, optionsOverride) {
                return notify({
                    type: toastType.info,
                    iconClass: getOptions().iconClasses.info,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function subscribe(callback) {
                listener = callback;
            }

            function success(message, title, optionsOverride) {
                return notify({
                    type: toastType.success,
                    iconClass: getOptions().iconClasses.success,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function warning(message, title, optionsOverride) {
                return notify({
                    type: toastType.warning,
                    iconClass: getOptions().iconClasses.warning,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function clear($toastElement, clearOptions) {
                var options = getOptions();
                if (!$container) { getContainer(options); }
                if (!clearToast($toastElement, options, clearOptions)) {
                    clearContainer(options);
                }
            }

            function remove($toastElement) {
                var options = getOptions();
                if (!$container) { getContainer(options); }
                if ($toastElement && $(':focus', $toastElement).length === 0) {
                    removeToast($toastElement);
                    return;
                }
                if ($container.children().length) {
                    $container.remove();
                }
            }

            // internal functions

            function clearContainer (options) {
                var toastsToClear = $container.children();
                for (var i = toastsToClear.length - 1; i >= 0; i--) {
                    clearToast($(toastsToClear[i]), options);
                }
            }

            function clearToast ($toastElement, options, clearOptions) {
                var force = clearOptions && clearOptions.force ? clearOptions.force : false;
                if ($toastElement && (force || $(':focus', $toastElement).length === 0)) {
                    $toastElement[options.hideMethod]({
                        duration: options.hideDuration,
                        easing: options.hideEasing,
                        complete: function () { removeToast($toastElement); }
                    });
                    return true;
                }
                return false;
            }

            function createContainer(options) {
                $container = $('<div/>')
                    .attr('id', options.containerId)
                    .addClass(options.positionClass);

                $container.appendTo($(options.target));
                return $container;
            }

            function getDefaults() {
                return {
                    tapToDismiss: true,
                    toastClass: 'toast',
                    containerId: 'toast-container',
                    debug: false,

                    showMethod: 'fadeIn', //fadeIn, slideDown, and show are built into jQuery
                    showDuration: 300,
                    showEasing: 'swing', //swing and linear are built into jQuery
                    onShown: undefined,
                    hideMethod: 'fadeOut',
                    hideDuration: 1000,
                    hideEasing: 'swing',
                    onHidden: undefined,
                    closeMethod: false,
                    closeDuration: false,
                    closeEasing: false,
                    closeOnHover: true,

                    extendedTimeOut: 1000,
                    iconClasses: {
                        error: 'toast-error',
                        info: 'toast-info',
                        success: 'toast-success',
                        warning: 'toast-warning'
                    },
                    iconClass: 'toast-info',
                    positionClass: 'toast-top-right',
                    timeOut: 5000, // Set timeOut and extendedTimeOut to 0 to make it sticky
                    titleClass: 'toast-title',
                    messageClass: 'toast-message',
                    escapeHtml: false,
                    target: 'body',
                    closeHtml: '<button type="button">&times;</button>',
                    closeClass: 'toast-close-button',
                    newestOnTop: true,
                    preventDuplicates: false,
                    progressBar: false,
                    progressClass: 'toast-progress',
                    rtl: false
                };
            }

            function publish(args) {
                if (!listener) { return; }
                listener(args);
            }

            function notify(map) {
                var options = getOptions();
                var iconClass = map.iconClass || options.iconClass;

                if (typeof (map.optionsOverride) !== 'undefined') {
                    options = $.extend(options, map.optionsOverride);
                    iconClass = map.optionsOverride.iconClass || iconClass;
                }

                if (shouldExit(options, map)) { return; }

                toastId++;

                $container = getContainer(options, true);

                var intervalId = null;
                var $toastElement = $('<div/>');
                var $titleElement = $('<div/>');
                var $messageElement = $('<div/>');
                var $progressElement = $('<div/>');
                var $closeElement = $(options.closeHtml);
                var progressBar = {
                    intervalId: null,
                    hideEta: null,
                    maxHideTime: null
                };
                var response = {
                    toastId: toastId,
                    state: 'visible',
                    startTime: new Date(),
                    options: options,
                    map: map
                };

                personalizeToast();

                displayToast();

                handleEvents();

                publish(response);

                if (options.debug && console) {
                    console.log(response);
                }

                return $toastElement;

                function escapeHtml(source) {
                    if (source == null) {
                        source = '';
                    }

                    return source
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                }

                function personalizeToast() {
                    setIcon();
                    setTitle();
                    setMessage();
                    setCloseButton();
                    setProgressBar();
                    setRTL();
                    setSequence();
                    setAria();
                }

                function setAria() {
                    var ariaValue = '';
                    switch (map.iconClass) {
                        case 'toast-success':
                        case 'toast-info':
                            ariaValue =  'polite';
                            break;
                        default:
                            ariaValue = 'assertive';
                    }
                    $toastElement.attr('aria-live', ariaValue);
                }

                function handleEvents() {
                    if (options.closeOnHover) {
                        $toastElement.hover(stickAround, delayedHideToast);
                    }

                    if (!options.onclick && options.tapToDismiss) {
                        $toastElement.click(hideToast);
                    }

                    if (options.closeButton && $closeElement) {
                        $closeElement.click(function (event) {
                            if (event.stopPropagation) {
                                event.stopPropagation();
                            } else if (event.cancelBubble !== undefined && event.cancelBubble !== true) {
                                event.cancelBubble = true;
                            }

                            if (options.onCloseClick) {
                                options.onCloseClick(event);
                            }

                            hideToast(true);
                        });
                    }

                    if (options.onclick) {
                        $toastElement.click(function (event) {
                            options.onclick(event);
                            hideToast();
                        });
                    }
                }

                function displayToast() {
                    $toastElement.hide();

                    $toastElement[options.showMethod](
                        {duration: options.showDuration, easing: options.showEasing, complete: options.onShown}
                    );

                    if (options.timeOut > 0) {
                        intervalId = setTimeout(hideToast, options.timeOut);
                        progressBar.maxHideTime = parseFloat(options.timeOut);
                        progressBar.hideEta = new Date().getTime() + progressBar.maxHideTime;
                        if (options.progressBar) {
                            progressBar.intervalId = setInterval(updateProgress, 10);
                        }
                    }
                }

                function setIcon() {
                    if (map.iconClass) {
                        $toastElement.addClass(options.toastClass).addClass(iconClass);
                    }
                }

                function setSequence() {
                    if (options.newestOnTop) {
                        $container.prepend($toastElement);
                    } else {
                        $container.append($toastElement);
                    }
                }

                function setTitle() {
                    if (map.title) {
                        var suffix = map.title;
                        if (options.escapeHtml) {
                            suffix = escapeHtml(map.title);
                        }
                        $titleElement.append(suffix).addClass(options.titleClass);
                        $toastElement.append($titleElement);
                    }
                }

                function setMessage() {
                    if (map.message) {
                        var suffix = map.message;
                        if (options.escapeHtml) {
                            suffix = escapeHtml(map.message);
                        }
                        $messageElement.append(suffix).addClass(options.messageClass);
                        $toastElement.append($messageElement);
                    }
                }

                function setCloseButton() {
                    if (options.closeButton) {
                        $closeElement.addClass(options.closeClass).attr('role', 'button');
                        $toastElement.prepend($closeElement);
                    }
                }

                function setProgressBar() {
                    if (options.progressBar) {
                        $progressElement.addClass(options.progressClass);
                        $toastElement.prepend($progressElement);
                    }
                }

                function setRTL() {
                    if (options.rtl) {
                        $toastElement.addClass('rtl');
                    }
                }

                function shouldExit(options, map) {
                    if (options.preventDuplicates) {
                        if (map.message === previousToast) {
                            return true;
                        } else {
                            previousToast = map.message;
                        }
                    }
                    return false;
                }

                function hideToast(override) {
                    var method = override && options.closeMethod !== false ? options.closeMethod : options.hideMethod;
                    var duration = override && options.closeDuration !== false ?
                        options.closeDuration : options.hideDuration;
                    var easing = override && options.closeEasing !== false ? options.closeEasing : options.hideEasing;
                    if ($(':focus', $toastElement).length && !override) {
                        return;
                    }
                    clearTimeout(progressBar.intervalId);
                    return $toastElement[method]({
                        duration: duration,
                        easing: easing,
                        complete: function () {
                            removeToast($toastElement);
                            clearTimeout(intervalId);
                            if (options.onHidden && response.state !== 'hidden') {
                                options.onHidden();
                            }
                            response.state = 'hidden';
                            response.endTime = new Date();
                            publish(response);
                        }
                    });
                }

                function delayedHideToast() {
                    if (options.timeOut > 0 || options.extendedTimeOut > 0) {
                        intervalId = setTimeout(hideToast, options.extendedTimeOut);
                        progressBar.maxHideTime = parseFloat(options.extendedTimeOut);
                        progressBar.hideEta = new Date().getTime() + progressBar.maxHideTime;
                    }
                }

                function stickAround() {
                    clearTimeout(intervalId);
                    progressBar.hideEta = 0;
                    $toastElement.stop(true, true)[options.showMethod](
                        {duration: options.showDuration, easing: options.showEasing}
                    );
                }

                function updateProgress() {
                    var percentage = ((progressBar.hideEta - (new Date().getTime())) / progressBar.maxHideTime) * 100;
                    $progressElement.width(percentage + '%');
                }
            }

            function getOptions() {
                return $.extend({}, getDefaults(), toastr.options);
            }

            function removeToast($toastElement) {
                if (!$container) { $container = getContainer(); }
                if ($toastElement.is(':visible')) {
                    return;
                }
                $toastElement.remove();
                $toastElement = null;
                if ($container.children().length === 0) {
                    $container.remove();
                    previousToast = undefined;
                }
            }

        })();
    });
}(typeof define === 'function' && define.amd ? define : function (deps, factory) {
    if (typeof module !== 'undefined' && module.exports) { //Node
        module.exports = factory(require('jquery'));
    } else {
        window.toastr = factory(window.jQuery);
    }
}));

// ]]>
</script>

<script type="text/javascript">
// <![CDATA[
// inserted source code of file test-view-results.js:
/* jshint strict: true, immed: true, jquery: true, shadow: true, sub: true, -W040 */
/* globals Page:true, toastr:true */

/**
 * This is the JS code to support view-results.jsp, the page that shows after
 * the user submits a problem for evaluation.
 * 
 * toastr: https://github.com/CodeSeven/toastr
 *
 * @version 2017/06/23
 * - modified to remove client state after usage (to avoid multiple notifications/clutter)
 * - made to pass JSHint
 * @version 2017/05/31
 * - initial version
 */

(function() {
	"use strict";

	$(document).ready(function() {
		var options = {closeButton: true, progressBar: true};
		var viewLink = Page.clientStateRemove("achievementsurl");
		toastr.options.onclick = function() {
			Page.redirect(viewLink);
		};

		var delay = 1000;
		var achievements = Page.clientStateRemove("achievements");
		achievements.forEach(function(a) {
			var achievement = a.achievement;
			if (achievement) {
				var title = achievement.name;
				var message = achievement.description;

				setTimeout(function() {
					toastr.success(message, title, options);
				}, delay);
				delay += 1000;
			}
		});
	});
})();

// ]]>
</script>

 

`;
    let datwo = `




	













<script type="text/javascript">
(function() {
	if (typeof window.__csbsClientState === 'undefined') { window.__csbsClientState = {}; }
	window.__csbsClientState["achievements"] = [];
	window.__csbsClientState["achievementsurl"] = "/achievement/view";
})();
</script>


<span id="testresultsclosearea">
	<a style="font-size: 16pt; margin-right: 5px;" title="Close test results" onclick="$('#testresultsarea *').fadeOut();"><i class="fa fa-times"></i></a>
</span>





	
	<p id="passcountmessage">
		<span id="passcountmessagespan" class="didnotpassall">
			<i class="fa fa-times-circle fail-icon"></i>
			<strong>You passed 0 of 1 tests.</strong>
	
			Try again.
		</span>
	</p>
	



	

	

	
	
		
			
			<div id="testresultsholder">
				<div id="testresults">
					
					
						
						
						
							<div class="testcase fail">
								<div class="problemnumberandname testresultrow">
									<span class="probleminfoheading"><span class="problemnumber">test #1:</span></span>
									<span class="problemname"><span>output</span></span>
								</div>
								
								
								
	
								
									
									
										<div class="testresultrow">
											<span class="probleminfoheading">expected output:</span>
											<span class="problemexpected problemoutput">This&nbsp;is&nbsp;a&nbsp;test&nbsp;of&nbsp;the
emergency&nbsp;broadcast&nbsp;system.
</span>
										</div>
										<div class="testresultrow">
											<span class="probleminfoheading">your output:</span>
											<span class="problemactual problemoutput">==&gt;&nbsp;CodeStepByStep.py&nbsp;&lt;==
&nbsp;&nbsp;&nbsp;&nbsp;#&nbsp;return&nbsp;a&nbsp;random&nbsp;boolean&nbsp;value&nbsp;with&nbsp;True&nbsp;having&nbsp;the&nbsp;given&nbsp;probability&nbsp;of&nbsp;being&nbsp;chosen
&nbsp;&nbsp;&nbsp;&nbsp;#&nbsp;from&nbsp;0&nbsp;to&nbsp;1,&nbsp;default&nbsp;0.5&nbsp;(50%).
&nbsp;&nbsp;&nbsp;&nbsp;#&nbsp;e.g.&nbsp;if&nbsp;randbool():&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;#&nbsp;True&nbsp;half&nbsp;the&nbsp;time
&nbsp;&nbsp;&nbsp;&nbsp;#&nbsp;e.g.&nbsp;if&nbsp;randbool(0.75):&nbsp;&nbsp;&nbsp;#&nbsp;True&nbsp;75%&nbsp;of&nbsp;the&nbsp;time
&nbsp;&nbsp;&nbsp;&nbsp;def&nbsp;randbool(self,&nbsp;odds&nbsp;=&nbsp;0.5):
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;num&nbsp;=&nbsp;self.random()&nbsp;&nbsp;&nbsp;#&nbsp;from&nbsp;[0.0&nbsp;-&nbsp;1.0)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;return&nbsp;num&nbsp;&lt;&nbsp;odds
&nbsp;&nbsp;&nbsp;&nbsp;
&nbsp;&nbsp;&nbsp;&nbsp;def&nbsp;random(self):
...</span>
										</div>
										
										
											<div class="testresultrow">
												<span class="probleminfoheading">differences:</span>
												<span class="problemactual problemoutput">1,2c1,11
<ins class="diff">&lt; This<span class="space">·</span>is<span class="space">·</span>a<span class="space">·</span>test<span class="space">·</span>of<span class="space">·</span>the</ins>
<ins class="diff">&lt; emergency<span class="space">·</span>broadcast<span class="space">·</span>system.</ins>
<del class="diff">&gt; ==&gt;<span class="space">·</span>CodeStepByStep.py<span class="space">·</span>&lt;==</del>
<del class="diff">&gt; <span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span>#<span class="space">·</span>return<span class="space">·</span>a<span class="space">·</span>random<span class="space">·</span>boolean<span class="space">·</span>value<span class="space">·</span>with<span class="space">·</span>True<span class="space">·</span>having<span class="space">·</span>the<span class="space">·</span>given<span class="space">·</span>probability<span class="space">·</span>of<span class="space">·</span>being<span class="space">·</span>chosen</del>
<del class="diff">&gt; <span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span>#<span class="space">·</span>from<span class="space">·</span>0<span class="space">·</span>to<span class="space">·</span>1,<span class="space">·</span>default<span class="space">·</span>0.5<span class="space">·</span>(50%).</del>
<del class="diff">&gt; <span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span>#<span class="space">·</span>e.g.<span class="space">·</span>if<span class="space">·</span>randbool():<span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span>#<span class="space">·</span>True<span class="space">·</span>half<span class="space">·</span>the<span class="space">·</span>time</del>
<del class="diff">&gt; <span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span>#<span class="space">·</span>e.g.<span class="space">·</span>if<span class="space">·</span>randbool(0.75):<span class="space">·</span><span class="space">·</span><span class="space">·</span>#<span class="space">·</span>True<span class="space">·</span>75%<span class="space">·</span>of<span class="space">·</span>the<span class="space">·</span>time</del>
<del class="diff">&gt; <span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span>def<span class="space">·</span>randbool(self,<span class="space">·</span>odds<span class="space">·</span>=<span class="space">·</span>0.5):</del>
<del class="diff">&gt; <span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span>num<span class="space">·</span>=<span class="space">·</span>self.random()<span class="space">·</span><span class="space">·</span><span class="space">·</span>#<span class="space">·</span>from<span class="space">·</span>[0.0<span class="space">·</span>-<span class="space">·</span>1.0)</del>
<del class="diff">&gt; <span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span>return<span class="space">·</span>num<span class="space">·</span>&lt;<span class="space">·</span>odds</del>
<del class="diff">&gt; </del>
<del class="diff">&gt; <span class="space">·</span><span class="space">·</span><span class="space">·</span><span class="space">·</span>def<span class="space">·</span>random(self):</del>
<del class="diff">&gt; ...</del></span>
											</div>
										
									
								
								
								
								
								
								
								
								
								
								
								
	
								
									
									
									<div class="testresultrow">
										<span class="probleminfoheading"> exception:</span>
										<span class="problemactual "><span class="exception syntaxerror" data-expected="false"><span class="errortype">NameError</span>: <span class="errordescription">name 'my_program' is not defined</span></span></span>
									</div>
								
									
								
								
								
									<div class="testresultrow problemresult">
										
										<span class="probleminfoheading">result:</span>
										<span class="problemtestresult">
											<i class="fa fa-times-circle fail-icon"></i>
											fail
										</span>
									</div>
								
						
									
								
								
								
							</div>
						
					 
					
					
				</div> 
			</div>
		 
	 
 

 




<style type="text/css">
/* inserted source code of file toastr.css */
/*
 * Note that this is toastr v2.1.3, the "latest" version in url has no more maintenance,
 * please go to https://cdnjs.com/libraries/toastr.js and pick a certain version you want to use,
 * make sure you copy the url from the website since the url may change between versions.
 * */
.toast-title {
  font-weight: bold;
}
.toast-message {
  -ms-word-wrap: break-word;
  word-wrap: break-word;
}
.toast-message a,
.toast-message label {
  color: #FFFFFF;
}
.toast-message a:hover {
  color: #CCCCCC;
  text-decoration: none;
}
.toast-close-button {
  position: relative;
  right: -0.3em;
  top: -0.3em;
  float: right;
  font-size: 20px;
  font-weight: bold;
  color: #FFFFFF;
  -webkit-text-shadow: 0 1px 0 #ffffff;
  text-shadow: 0 1px 0 #ffffff;
  opacity: 0.8;
  -ms-filter: progid:DXImageTransform.Microsoft.Alpha(Opacity=80);
  filter: alpha(opacity=80);
  line-height: 1;
}
.toast-close-button:hover,
.toast-close-button:focus {
  color: #000000;
  text-decoration: none;
  cursor: pointer;
  opacity: 0.4;
  -ms-filter: progid:DXImageTransform.Microsoft.Alpha(Opacity=40);
  filter: alpha(opacity=40);
}
.rtl .toast-close-button {
  left: -0.3em;
  float: left;
  right: 0.3em;
}
/*Additional properties for button version
 iOS requires the button element instead of an anchor tag.
 If you want the anchor version, it requires \`href="#"\`.*/
button.toast-close-button {
  padding: 0;
  cursor: pointer;
  background: transparent;
  border: 0;
  -webkit-appearance: none;
}
.toast-top-center {
  top: 0;
  right: 0;
  width: 100%;
}
.toast-bottom-center {
  bottom: 0;
  right: 0;
  width: 100%;
}
.toast-top-full-width {
  top: 0;
  right: 0;
  width: 100%;
}
.toast-bottom-full-width {
  bottom: 0;
  right: 0;
  width: 100%;
}
.toast-top-left {
  top: 12px;
  left: 12px;
}
.toast-top-right {
  top: 12px;
  right: 12px;
}
.toast-bottom-right {
  right: 12px;
  bottom: 12px;
}
.toast-bottom-left {
  bottom: 12px;
  left: 12px;
}
#toast-container {
  position: fixed;
  z-index: 999999;
  pointer-events: none;
  /*overrides*/
}
#toast-container * {
  -moz-box-sizing: border-box;
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
}
#toast-container > div {
  position: relative;
  pointer-events: auto;
  overflow: hidden;
  margin: 0 0 6px;
  padding: 15px 15px 15px 50px;
  width: 300px;
  -moz-border-radius: 3px 3px 3px 3px;
  -webkit-border-radius: 3px 3px 3px 3px;
  border-radius: 3px 3px 3px 3px;
  background-position: 15px center;
  background-repeat: no-repeat;
  -moz-box-shadow: 0 0 12px #999999;
  -webkit-box-shadow: 0 0 12px #999999;
  box-shadow: 0 0 12px #999999;
  color: #FFFFFF;
  opacity: 0.8;
  -ms-filter: progid:DXImageTransform.Microsoft.Alpha(Opacity=80);
  filter: alpha(opacity=80);
}
#toast-container > div.rtl {
  direction: rtl;
  padding: 15px 50px 15px 15px;
  background-position: right 15px center;
}
#toast-container > div:hover {
  -moz-box-shadow: 0 0 12px #000000;
  -webkit-box-shadow: 0 0 12px #000000;
  box-shadow: 0 0 12px #000000;
  opacity: 1;
  -ms-filter: progid:DXImageTransform.Microsoft.Alpha(Opacity=100);
  filter: alpha(opacity=100);
  cursor: pointer;
}
#toast-container > .toast-info {
  background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGwSURBVEhLtZa9SgNBEMc9sUxxRcoUKSzSWIhXpFMhhYWFhaBg4yPYiWCXZxBLERsLRS3EQkEfwCKdjWJAwSKCgoKCcudv4O5YLrt7EzgXhiU3/4+b2ckmwVjJSpKkQ6wAi4gwhT+z3wRBcEz0yjSseUTrcRyfsHsXmD0AmbHOC9Ii8VImnuXBPglHpQ5wwSVM7sNnTG7Za4JwDdCjxyAiH3nyA2mtaTJufiDZ5dCaqlItILh1NHatfN5skvjx9Z38m69CgzuXmZgVrPIGE763Jx9qKsRozWYw6xOHdER+nn2KkO+Bb+UV5CBN6WC6QtBgbRVozrahAbmm6HtUsgtPC19tFdxXZYBOfkbmFJ1VaHA1VAHjd0pp70oTZzvR+EVrx2Ygfdsq6eu55BHYR8hlcki+n+kERUFG8BrA0BwjeAv2M8WLQBtcy+SD6fNsmnB3AlBLrgTtVW1c2QN4bVWLATaIS60J2Du5y1TiJgjSBvFVZgTmwCU+dAZFoPxGEEs8nyHC9Bwe2GvEJv2WXZb0vjdyFT4Cxk3e/kIqlOGoVLwwPevpYHT+00T+hWwXDf4AJAOUqWcDhbwAAAAASUVORK5CYII=") !important;
}
#toast-container > .toast-error {
  background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAHOSURBVEhLrZa/SgNBEMZzh0WKCClSCKaIYOED+AAKeQQLG8HWztLCImBrYadgIdY+gIKNYkBFSwu7CAoqCgkkoGBI/E28PdbLZmeDLgzZzcx83/zZ2SSXC1j9fr+I1Hq93g2yxH4iwM1vkoBWAdxCmpzTxfkN2RcyZNaHFIkSo10+8kgxkXIURV5HGxTmFuc75B2RfQkpxHG8aAgaAFa0tAHqYFfQ7Iwe2yhODk8+J4C7yAoRTWI3w/4klGRgR4lO7Rpn9+gvMyWp+uxFh8+H+ARlgN1nJuJuQAYvNkEnwGFck18Er4q3egEc/oO+mhLdKgRyhdNFiacC0rlOCbhNVz4H9FnAYgDBvU3QIioZlJFLJtsoHYRDfiZoUyIxqCtRpVlANq0EU4dApjrtgezPFad5S19Wgjkc0hNVnuF4HjVA6C7QrSIbylB+oZe3aHgBsqlNqKYH48jXyJKMuAbiyVJ8KzaB3eRc0pg9VwQ4niFryI68qiOi3AbjwdsfnAtk0bCjTLJKr6mrD9g8iq/S/B81hguOMlQTnVyG40wAcjnmgsCNESDrjme7wfftP4P7SP4N3CJZdvzoNyGq2c/HWOXJGsvVg+RA/k2MC/wN6I2YA2Pt8GkAAAAASUVORK5CYII=") !important;
}
#toast-container > .toast-success {
  background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAADsSURBVEhLY2AYBfQMgf///3P8+/evAIgvA/FsIF+BavYDDWMBGroaSMMBiE8VC7AZDrIFaMFnii3AZTjUgsUUWUDA8OdAH6iQbQEhw4HyGsPEcKBXBIC4ARhex4G4BsjmweU1soIFaGg/WtoFZRIZdEvIMhxkCCjXIVsATV6gFGACs4Rsw0EGgIIH3QJYJgHSARQZDrWAB+jawzgs+Q2UO49D7jnRSRGoEFRILcdmEMWGI0cm0JJ2QpYA1RDvcmzJEWhABhD/pqrL0S0CWuABKgnRki9lLseS7g2AlqwHWQSKH4oKLrILpRGhEQCw2LiRUIa4lwAAAABJRU5ErkJggg==") !important;
}
#toast-container > .toast-warning {
  background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGYSURBVEhL5ZSvTsNQFMbXZGICMYGYmJhAQIJAICYQPAACiSDB8AiICQQJT4CqQEwgJvYASAQCiZiYmJhAIBATCARJy+9rTsldd8sKu1M0+dLb057v6/lbq/2rK0mS/TRNj9cWNAKPYIJII7gIxCcQ51cvqID+GIEX8ASG4B1bK5gIZFeQfoJdEXOfgX4QAQg7kH2A65yQ87lyxb27sggkAzAuFhbbg1K2kgCkB1bVwyIR9m2L7PRPIhDUIXgGtyKw575yz3lTNs6X4JXnjV+LKM/m3MydnTbtOKIjtz6VhCBq4vSm3ncdrD2lk0VgUXSVKjVDJXJzijW1RQdsU7F77He8u68koNZTz8Oz5yGa6J3H3lZ0xYgXBK2QymlWWA+RWnYhskLBv2vmE+hBMCtbA7KX5drWyRT/2JsqZ2IvfB9Y4bWDNMFbJRFmC9E74SoS0CqulwjkC0+5bpcV1CZ8NMej4pjy0U+doDQsGyo1hzVJttIjhQ7GnBtRFN1UarUlH8F3xict+HY07rEzoUGPlWcjRFRr4/gChZgc3ZL2d8oAAAAASUVORK5CYII=") !important;
}
#toast-container.toast-top-center > div,
#toast-container.toast-bottom-center > div {
  width: 300px;
  margin-left: auto;
  margin-right: auto;
}
#toast-container.toast-top-full-width > div,
#toast-container.toast-bottom-full-width > div {
  width: 96%;
  margin-left: auto;
  margin-right: auto;
}
.toast {
  background-color: #030303;
}
.toast-success {
  background-color: #51A351;
}
.toast-error {
  background-color: #BD362F;
}
.toast-info {
  background-color: #2F96B4;
}
.toast-warning {
  background-color: #F89406;
}
.toast-progress {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 4px;
  background-color: #000000;
  opacity: 0.4;
  -ms-filter: progid:DXImageTransform.Microsoft.Alpha(Opacity=40);
  filter: alpha(opacity=40);
}
/*Responsive Design*/
@media all and (max-width: 240px) {
  #toast-container > div {
    padding: 8px 8px 8px 50px;
    width: 11em;
  }
  #toast-container > div.rtl {
    padding: 8px 50px 8px 8px;
  }
  #toast-container .toast-close-button {
    right: -0.2em;
    top: -0.2em;
  }
  #toast-container .rtl .toast-close-button {
    left: -0.2em;
    right: 0.2em;
  }
}
@media all and (min-width: 241px) and (max-width: 480px) {
  #toast-container > div {
    padding: 8px 8px 8px 50px;
    width: 18em;
  }
  #toast-container > div.rtl {
    padding: 8px 50px 8px 8px;
  }
  #toast-container .toast-close-button {
    right: -0.2em;
    top: -0.2em;
  }
  #toast-container .rtl .toast-close-button {
    left: -0.2em;
    right: 0.2em;
  }
}
@media all and (min-width: 481px) and (max-width: 768px) {
  #toast-container > div {
    padding: 15px 15px 15px 50px;
    width: 25em;
  }
  #toast-container > div.rtl {
    padding: 15px 50px 15px 15px;
  }
}

</style>

<script type="text/javascript">
// <![CDATA[
// inserted source code of file toastr.js:
/*
 * Toastr
 * Copyright 2012-2015
 * Authors: John Papa, Hans Fjällemark, and Tim Ferrell.
 * All Rights Reserved.
 * Use, reproduction, distribution, and modification of this code is subject to the terms and
 * conditions of the MIT license, available at http://www.opensource.org/licenses/mit-license.php
 *
 * ARIA Support: Greta Krafsig
 *
 * Project: https://github.com/CodeSeven/toastr
 */
/* global define */
(function (define) {
    define(['jquery'], function ($) {
        return (function () {
            var $container;
            var listener;
            var toastId = 0;
            var toastType = {
                error: 'error',
                info: 'info',
                success: 'success',
                warning: 'warning'
            };

            var toastr = {
                clear: clear,
                remove: remove,
                error: error,
                getContainer: getContainer,
                info: info,
                options: {},
                subscribe: subscribe,
                success: success,
                version: '2.1.3',
                warning: warning
            };

            var previousToast;

            return toastr;

            ////////////////

            function error(message, title, optionsOverride) {
                return notify({
                    type: toastType.error,
                    iconClass: getOptions().iconClasses.error,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function getContainer(options, create) {
                if (!options) { options = getOptions(); }
                $container = $('#' + options.containerId);
                if ($container.length) {
                    return $container;
                }
                if (create) {
                    $container = createContainer(options);
                }
                return $container;
            }

            function info(message, title, optionsOverride) {
                return notify({
                    type: toastType.info,
                    iconClass: getOptions().iconClasses.info,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function subscribe(callback) {
                listener = callback;
            }

            function success(message, title, optionsOverride) {
                return notify({
                    type: toastType.success,
                    iconClass: getOptions().iconClasses.success,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function warning(message, title, optionsOverride) {
                return notify({
                    type: toastType.warning,
                    iconClass: getOptions().iconClasses.warning,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function clear($toastElement, clearOptions) {
                var options = getOptions();
                if (!$container) { getContainer(options); }
                if (!clearToast($toastElement, options, clearOptions)) {
                    clearContainer(options);
                }
            }

            function remove($toastElement) {
                var options = getOptions();
                if (!$container) { getContainer(options); }
                if ($toastElement && $(':focus', $toastElement).length === 0) {
                    removeToast($toastElement);
                    return;
                }
                if ($container.children().length) {
                    $container.remove();
                }
            }

            // internal functions

            function clearContainer (options) {
                var toastsToClear = $container.children();
                for (var i = toastsToClear.length - 1; i >= 0; i--) {
                    clearToast($(toastsToClear[i]), options);
                }
            }

            function clearToast ($toastElement, options, clearOptions) {
                var force = clearOptions && clearOptions.force ? clearOptions.force : false;
                if ($toastElement && (force || $(':focus', $toastElement).length === 0)) {
                    $toastElement[options.hideMethod]({
                        duration: options.hideDuration,
                        easing: options.hideEasing,
                        complete: function () { removeToast($toastElement); }
                    });
                    return true;
                }
                return false;
            }

            function createContainer(options) {
                $container = $('<div/>')
                    .attr('id', options.containerId)
                    .addClass(options.positionClass);

                $container.appendTo($(options.target));
                return $container;
            }

            function getDefaults() {
                return {
                    tapToDismiss: true,
                    toastClass: 'toast',
                    containerId: 'toast-container',
                    debug: false,

                    showMethod: 'fadeIn', //fadeIn, slideDown, and show are built into jQuery
                    showDuration: 300,
                    showEasing: 'swing', //swing and linear are built into jQuery
                    onShown: undefined,
                    hideMethod: 'fadeOut',
                    hideDuration: 1000,
                    hideEasing: 'swing',
                    onHidden: undefined,
                    closeMethod: false,
                    closeDuration: false,
                    closeEasing: false,
                    closeOnHover: true,

                    extendedTimeOut: 1000,
                    iconClasses: {
                        error: 'toast-error',
                        info: 'toast-info',
                        success: 'toast-success',
                        warning: 'toast-warning'
                    },
                    iconClass: 'toast-info',
                    positionClass: 'toast-top-right',
                    timeOut: 5000, // Set timeOut and extendedTimeOut to 0 to make it sticky
                    titleClass: 'toast-title',
                    messageClass: 'toast-message',
                    escapeHtml: false,
                    target: 'body',
                    closeHtml: '<button type="button">&times;</button>',
                    closeClass: 'toast-close-button',
                    newestOnTop: true,
                    preventDuplicates: false,
                    progressBar: false,
                    progressClass: 'toast-progress',
                    rtl: false
                };
            }

            function publish(args) {
                if (!listener) { return; }
                listener(args);
            }

            function notify(map) {
                var options = getOptions();
                var iconClass = map.iconClass || options.iconClass;

                if (typeof (map.optionsOverride) !== 'undefined') {
                    options = $.extend(options, map.optionsOverride);
                    iconClass = map.optionsOverride.iconClass || iconClass;
                }

                if (shouldExit(options, map)) { return; }

                toastId++;

                $container = getContainer(options, true);

                var intervalId = null;
                var $toastElement = $('<div/>');
                var $titleElement = $('<div/>');
                var $messageElement = $('<div/>');
                var $progressElement = $('<div/>');
                var $closeElement = $(options.closeHtml);
                var progressBar = {
                    intervalId: null,
                    hideEta: null,
                    maxHideTime: null
                };
                var response = {
                    toastId: toastId,
                    state: 'visible',
                    startTime: new Date(),
                    options: options,
                    map: map
                };

                personalizeToast();

                displayToast();

                handleEvents();

                publish(response);

                if (options.debug && console) {
                    console.log(response);
                }

                return $toastElement;

                function escapeHtml(source) {
                    if (source == null) {
                        source = '';
                    }

                    return source
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                }

                function personalizeToast() {
                    setIcon();
                    setTitle();
                    setMessage();
                    setCloseButton();
                    setProgressBar();
                    setRTL();
                    setSequence();
                    setAria();
                }

                function setAria() {
                    var ariaValue = '';
                    switch (map.iconClass) {
                        case 'toast-success':
                        case 'toast-info':
                            ariaValue =  'polite';
                            break;
                        default:
                            ariaValue = 'assertive';
                    }
                    $toastElement.attr('aria-live', ariaValue);
                }

                function handleEvents() {
                    if (options.closeOnHover) {
                        $toastElement.hover(stickAround, delayedHideToast);
                    }

                    if (!options.onclick && options.tapToDismiss) {
                        $toastElement.click(hideToast);
                    }

                    if (options.closeButton && $closeElement) {
                        $closeElement.click(function (event) {
                            if (event.stopPropagation) {
                                event.stopPropagation();
                            } else if (event.cancelBubble !== undefined && event.cancelBubble !== true) {
                                event.cancelBubble = true;
                            }

                            if (options.onCloseClick) {
                                options.onCloseClick(event);
                            }

                            hideToast(true);
                        });
                    }

                    if (options.onclick) {
                        $toastElement.click(function (event) {
                            options.onclick(event);
                            hideToast();
                        });
                    }
                }

                function displayToast() {
                    $toastElement.hide();

                    $toastElement[options.showMethod](
                        {duration: options.showDuration, easing: options.showEasing, complete: options.onShown}
                    );

                    if (options.timeOut > 0) {
                        intervalId = setTimeout(hideToast, options.timeOut);
                        progressBar.maxHideTime = parseFloat(options.timeOut);
                        progressBar.hideEta = new Date().getTime() + progressBar.maxHideTime;
                        if (options.progressBar) {
                            progressBar.intervalId = setInterval(updateProgress, 10);
                        }
                    }
                }

                function setIcon() {
                    if (map.iconClass) {
                        $toastElement.addClass(options.toastClass).addClass(iconClass);
                    }
                }

                function setSequence() {
                    if (options.newestOnTop) {
                        $container.prepend($toastElement);
                    } else {
                        $container.append($toastElement);
                    }
                }

                function setTitle() {
                    if (map.title) {
                        var suffix = map.title;
                        if (options.escapeHtml) {
                            suffix = escapeHtml(map.title);
                        }
                        $titleElement.append(suffix).addClass(options.titleClass);
                        $toastElement.append($titleElement);
                    }
                }

                function setMessage() {
                    if (map.message) {
                        var suffix = map.message;
                        if (options.escapeHtml) {
                            suffix = escapeHtml(map.message);
                        }
                        $messageElement.append(suffix).addClass(options.messageClass);
                        $toastElement.append($messageElement);
                    }
                }

                function setCloseButton() {
                    if (options.closeButton) {
                        $closeElement.addClass(options.closeClass).attr('role', 'button');
                        $toastElement.prepend($closeElement);
                    }
                }

                function setProgressBar() {
                    if (options.progressBar) {
                        $progressElement.addClass(options.progressClass);
                        $toastElement.prepend($progressElement);
                    }
                }

                function setRTL() {
                    if (options.rtl) {
                        $toastElement.addClass('rtl');
                    }
                }

                function shouldExit(options, map) {
                    if (options.preventDuplicates) {
                        if (map.message === previousToast) {
                            return true;
                        } else {
                            previousToast = map.message;
                        }
                    }
                    return false;
                }

                function hideToast(override) {
                    var method = override && options.closeMethod !== false ? options.closeMethod : options.hideMethod;
                    var duration = override && options.closeDuration !== false ?
                        options.closeDuration : options.hideDuration;
                    var easing = override && options.closeEasing !== false ? options.closeEasing : options.hideEasing;
                    if ($(':focus', $toastElement).length && !override) {
                        return;
                    }
                    clearTimeout(progressBar.intervalId);
                    return $toastElement[method]({
                        duration: duration,
                        easing: easing,
                        complete: function () {
                            removeToast($toastElement);
                            clearTimeout(intervalId);
                            if (options.onHidden && response.state !== 'hidden') {
                                options.onHidden();
                            }
                            response.state = 'hidden';
                            response.endTime = new Date();
                            publish(response);
                        }
                    });
                }

                function delayedHideToast() {
                    if (options.timeOut > 0 || options.extendedTimeOut > 0) {
                        intervalId = setTimeout(hideToast, options.extendedTimeOut);
                        progressBar.maxHideTime = parseFloat(options.extendedTimeOut);
                        progressBar.hideEta = new Date().getTime() + progressBar.maxHideTime;
                    }
                }

                function stickAround() {
                    clearTimeout(intervalId);
                    progressBar.hideEta = 0;
                    $toastElement.stop(true, true)[options.showMethod](
                        {duration: options.showDuration, easing: options.showEasing}
                    );
                }

                function updateProgress() {
                    var percentage = ((progressBar.hideEta - (new Date().getTime())) / progressBar.maxHideTime) * 100;
                    $progressElement.width(percentage + '%');
                }
            }

            function getOptions() {
                return $.extend({}, getDefaults(), toastr.options);
            }

            function removeToast($toastElement) {
                if (!$container) { $container = getContainer(); }
                if ($toastElement.is(':visible')) {
                    return;
                }
                $toastElement.remove();
                $toastElement = null;
                if ($container.children().length === 0) {
                    $container.remove();
                    previousToast = undefined;
                }
            }

        })();
    });
}(typeof define === 'function' && define.amd ? define : function (deps, factory) {
    if (typeof module !== 'undefined' && module.exports) { //Node
        module.exports = factory(require('jquery'));
    } else {
        window.toastr = factory(window.jQuery);
    }
}));

// ]]>
</script>

<script type="text/javascript">
// <![CDATA[
// inserted source code of file test-view-results.js:
/* jshint strict: true, immed: true, jquery: true, shadow: true, sub: true, -W040 */
/* globals Page:true, toastr:true */

/**
 * This is the JS code to support view-results.jsp, the page that shows after
 * the user submits a problem for evaluation.
 * 
 * toastr: https://github.com/CodeSeven/toastr
 *
 * @version 2017/06/23
 * - modified to remove client state after usage (to avoid multiple notifications/clutter)
 * - made to pass JSHint
 * @version 2017/05/31
 * - initial version
 */

(function() {
	"use strict";

	$(document).ready(function() {
		var options = {closeButton: true, progressBar: true};
		var viewLink = Page.clientStateRemove("achievementsurl");
		toastr.options.onclick = function() {
			Page.redirect(viewLink);
		};

		var delay = 1000;
		var achievements = Page.clientStateRemove("achievements");
		achievements.forEach(function(a) {
			var achievement = a.achievement;
			if (achievement) {
				var title = achievement.name;
				var message = achievement.description;

				setTimeout(function() {
					toastr.success(message, title, options);
				}, delay);
				delay += 1000;
			}
		});
	});
})();

// ]]>
</script>

 

`;

    const regex = /(\(.*\))/gm;

    // Alternative syntax using RegExp constructor
    // const regex = new RegExp('\\((.*)\\)', 'gm')

    var el = $("<div></div>");
    el.html(data);
    let probex = $(el).find(".problemexpected");
    let probna = $(el).find(".problemname");

    console.log(probex);
    let fn = $(".functionname")[0].innerText;

    let pyFake = `def ${fn}(*args):`;

    for (let i = 0; i < probex.length; i++) {
      const str = probna[i].innerText;
      let m;
      const subst = ``;

      // The substituted value will be contained in the result variable
      const result = str.replace(regex, subst);

      console.log("Substitution result: ", result);

      while ((m = regex.exec(str)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
          regex.lastIndex++;
        }

        // The result can be accessed through the `m`-variable.
        m.forEach((match, groupIndex) => {
          pyFake = pyFake + `\n\tif (args == ${match}) or (args == ${match.slice(0,-1) + ",)"}) :\n\t\treturn ${probex[i].innerText}`;
          console.log(pyFake);
        });
      }
      console.log(probna[i].innerText);
      console.log(probex[i].innerText);
    }
    setSolutionCode(pyFake);

    if (typeof ga !== "undefined" && isCodeProblem()) {
      // Google Analytics: Record how long it took to process student's solution.
      ga("send", "timing", "Problem", "Process solution", new Date().getTime() - lastSolutionSubmitTimestamp);
    }

    var shouldDoEffect = !isMechanicalProblem() && !$("#testresults");
    var $testresultsarea = $("#testresultsarea");
    var $passcountmessagespan = $("#passcountmessagespan");

    if ($testresultsarea.length) {
      $testresultsarea.html(data);
      if (shouldDoEffect) {
        $testresultsarea.hide();
        $testresultsarea.show();
      } else {
        if ($passcountmessagespan.length) {
          // $("passcountmessagespan").scrollTo();
          $passcountmessagespan.effect("highlight", 2000);
        }
      }
    }

    // Purposefully duplicated selector
    $passcountmessagespan = $("#passcountmessagespan");
    if (!isTimedQuiz()) {
      if (true) {
        problemCorrect();
        updateSolved();
      } else if (!$("#submittooquickly").length) {
        problemIncorrect();
      }
    }

    // drawing panel problems
    $(".drawingpanelarea")
      .find("img.output")
      .each(function () {
        if (!$(this).prop("hasMouseObserver")) {
          $(this).mousemove(drawingPanelImageMouseMove);
          $(this).prop("hasMouseObserver", true);
        }
      });

    // highlight compiler errors, if any
    // clear any past error highlighting
    CodeMirrorSupport.clearLineWidgets();

    // http://codemirror.net/3/demo/widget.html
    // http://codemirror.net/3/doc/manual.html#addLineWidget
    var lineNumbersInUse = {}; // set of line numbers already occupied by an error

    $("#testresultsarea .compilererrors .compilererror, #testresultsarea .exception").each(function () {
      var lineNumber = parseInt($(this).find(".errorlinenumber").attr("rel"), 10);
      if (lineNumber < 0 || isNaN(lineNumber) || lineNumbersInUse[lineNumber]) {
        return;
      }
      var isException = $(this).hasClass("exception");
      var isExpectedException = $(this).data("expected");
      var isSyntaxError = $(this).hasClass("compilererror") || $(this).hasClass("syntaxerror");
      if (isExpectedException) {
        // don't display exceptions as errors in the student code if the test case
        // actually expected/wanted the student to throw an exception
        return;
      }

      var errorType = "";
      var errorMessage = Page.getTextContent($(this).find(".errordescription")[0]);
      if (isException) {
        lineNumbersInUse[lineNumber] = true;
        errorType = Page.getTextContent($(this).find(".errortype")[0]);

        errorMessage = errorType + (errorMessage ? ": " + errorMessage : "");
      }

      var errorMessageFriendly = Page.getTextContent($(this).find(".errorfriendlydescription")[0]);

      var errorDiv = document.createElement("div");
      var icon = errorDiv.appendChild(document.createElement("span"));
      icon.innerHTML = "!!";
      icon.className = "lint-error-icon";
      errorDiv.appendChild(document.createTextNode(errorMessage));

      // insert an "X" button to close the error div
      var xicon = document.createElement("i");
      xicon.className = "fa fa-times lint-error-close-icon";
      xicon.title = "Close";
      xicon.onclick = function () {
        if (xicon.widget) {
          xicon.widget.clear();
        }
      };
      errorDiv.appendChild(xicon);

      errorDiv.className = "lint-error";
      errorDiv.title = isSyntaxError ? "syntax error" : "error";
      if (errorMessageFriendly) {
        errorDiv.title += ": " + errorMessageFriendly;
      }

      // add gutters to each line
      var codeMirror = CodeMirrorSupport.getCodeMirror();
      var widget = codeMirror.addLineWidget(lineNumber - 1, errorDiv, {
        coverGutter: true,
        noHScroll: false,
      });
      xicon.widget = widget;
      codeMirror._widgets.push(widget);
    });

    solutionAjaxCommon();
    // var $solvedstatus = $("#solvedstatus");
    // var unsolved = $solvedstatus.hasClass("unsolved");
    // if (unsolved) {
    //   solutionSubmitClick();
    // }
  }

  // Runs when student's solution has been enqueued but not yet run.
  // Pings the server periodically until the solutions have been run and tested.
  function solutionAjaxSuccessEnqueue(data, status, ajax) {
    console.log("solutionAjaxSuccessEnqueue: status " + ajax.status);
    if (ajax.status == 200) {
      // solution has been run and test results are ready;
      // go on to actually show the results
      solutionAjaxSuccess(data);
    } else if (ajax.status == 202) {
      // accepted, but still waiting in queue

      var $testresultscurrentstatus = $("#testresultscurrentstatus");
      if ($testresultscurrentstatus.length) {
        if (!$testresultscurrentstatus.is(":visible")) {
          $testresultscurrentstatus.show();
        }
        $testresultscurrentstatus.html(data);
      }
      $("#loading").fadeOut();

      var checkJobStatusUrl = Page.clientState("checkjobstatusurl");
      if (!checkJobStatusUrl) {
        return false;
      }

      var params = {
        problemid: getProblemID(),
      };

      // ping periodically
      setTimeout(function () {
        $.ajax(checkJobStatusUrl, {
          method: "get",
          data: params,
          success: solutionAjaxSuccessEnqueue,
          error: solutionAjaxSuccessEnqueue,
          onException: solutionAjaxSuccessEnqueue,
        });
      }, getCheckJobStatusTimeout());
    } else {
      solutionAjaxFailure(ajax);
    }
  }

  function solutionAjaxFailure(ajax, exception) {
    $("#loading").hide();
    $("#loadingarea").hide();
    Page.ajaxFailure(ajax, exception);
    solutionAjaxCommon();
  }

  function solutionSelectChange(event) {
    var solutionCode = this.options[this.selectedIndex].value;
    if (shouldIndentSolutionCode()) {
      solutionCode = Indenter.indent(solutionCode);
    }
    setSolutionCode(solutionCode);
  }

  // submits the solution code to the server using Ajax,
  // then displays the result on the page.
  function solutionSubmitClick(event) {
    Events.abort(event);

    if ($(this).prop("disabled") || $("#solutionsubmit").prop("disabled")) {
      return false;
    }

    playSound(["click"]);

    // possibly refresh AdSense ad (for long-lived problem/view page sessions)
    CodeStepByStep.checkAdRefresh();

    var mechanical = isMechanicalProblem();
    if (mechanical) {
      processMechanicalSolution();
    } else {
      // always submit to server
      processServerSideSolution();
    }

    // save solution text string to make sure value has not changed later
    if (!isMultiLanguageProblem()) {
      $("#solution, .solution").prop("initialValue", getSolutionCode());
    }

    return false;
  }

  function solutionUpArrowClick(codeMirror) {
    console.log("solutionUpArrowClick", event);
    solutionUpDownArrorHelper(codeMirror, "Up");
  }

  function solutionDownArrowClick(codeMirror) {
    console.log("solutionDownArrowClick", event);
    solutionUpDownArrorHelper(codeMirror, "Down");
  }

  // When Up/Down arrow pressed, if at end of current line, goes to end of the new line.
  // (This is largely to avoid an awkward UX when user types } and then Up arrow.)
  function solutionUpDownArrorHelper(codeMirror, direction) {
    var noSelection = codeMirror.getSelection().length === 0;
    var cursor = codeMirror.getCursor();
    codeMirror.execCommand("goLine" + direction);
    if (noSelection) {
      var line = codeMirror.getLine(cursor.line) || "";
      if (line.length > 0 && cursor.ch >= line.length) {
        codeMirror.execCommand("goLineEnd");
      }
    }
  }

  function processMechanicalSolution() {
    // submit the solution form in the background
    $("#solutionsubmit").disableLink();
    var $testresults = $("#testresults");
    if ($testresults.length) {
      $testresults.addClass("outofdate");
    }
    $("#loading").show();
    $("#loadingarea").show();

    $("#solutionform").ajaxSubmit({
      async: true,
      success: solutionAjaxSuccess,
      error: solutionAjaxFailure,
    });
  }

  function processServerSideSolution() {
    var solutionText = getSolutionCode();
    if (!solutionText || !solutionText.trim()) {
      // don't submit empty code
      return false;
    }

    // server-side problem (more common); submit to server, so server can test it
    $("#solutionsubmit").disableLink();

    var $testresults = $("#testresults");

    if ($testresults.length) {
      $testresults.addClass("outofdate");
      var $passcountmessage = $("#passcountmessage");

      if ($passcountmessage.length) {
        $passcountmessage.addClass("outofdatetext");
      }
    }

    $("#loading").show();
    var $testresultsloadingarea = $("#testresultsloadingarea");
    if ($testresultsloadingarea.length) {
      if (!$testresultsloadingarea.is(":visible")) {
        $testresultsloadingarea.show();
      }
    }

    var $solutionform = $("#solutionform");
    var params = Page.getFormQueryParams($solutionform);
    params["solution"] = solutionText;
    CodeMirrorSupport.clearLineWidgets(); // clear any past syntax errors
    console.log(Page.getQueryString());
    // if viewing page in debug mode, pass this on to the server so it'll produce extra output
    var pageQueryParams = Page.getQueryString();
    if (true) {
      params["debug"] = "true";
    }
    if (true) {
      params["captureoutput"] = "true";
    }

    lastSolutionSubmitTimestamp = new Date().getTime();
    console.log(params);

    $.ajax($solutionform.prop("action"), {
      method: "post",
      data: params,
      success: solutionAjaxSuccessEnqueue,
      error: solutionAjaxFailure,
    });
  }

  function solutionKeyDown(event) {
    // for some reason, IE barfs on keypress events and is much better w/ keydown
    if (Browser.isIE() || Browser.isSafari()) {
      return solutionKeyPress(event);
    }
  }

  function solutionKeyPress(event) {
    var result = true;
    var textarea = this;
    if (event.which == 13) {
      // new line, \n
      result = Indenter.insertCharacter(textarea, Indenter.getLineSeparator(), false);

      // possibly grow text area to accommodate newly entered lines
      var lineCount = Page.getTextContent(textarea).split(Indenter.getLineSeparator()).length;
      // alert(lineCount);
      if (lineCount > textarea.rows - (Browser.isIE() ? 4 : 0)) {
        resizeSolution(lineCount + (Browser.isIE() ? 4 : 0));
      }
    } else if (event.which == 9) {
      // tab, \t
      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        result = Indenter.insertCharacter(textarea, Indenter.getTabString(), event.shiftKey);
      }
    } else if (typeof event.which !== "undefined" && event.which == "}".charCodeAt(0)) {
      // special case to unindent for closing braces
      result = Indenter.insertCharacter(textarea, "}", event.shiftKey);
    } else if (event.altKey && typeof event.charCode !== "undefined") {
      if (event.which == "S".charCodeAt(0)) {
        // Submit solution when user presses Alt+S
        solutionSubmitClick();
      } else if (event.which == "I".charCodeAt(0)) {
        // Indent solution when user presses Alt+I
        indentClick();
      } else if (event.which == "C".charCodeAt(0)) {
        // Clear solution when user presses Alt+C
        clearClick();
      }
    }

    if (!result) {
      // cancel the event
      Events.abort(event);
    }
    return result;
  }

  function stopTimedQuiz() {
    Cookies.remove(TIMED_QUIZ_START_COOKIE_NAME);
    clearInterval(timedQuizTimerID);
  }

  function stripComments(text) {
    // multi-line comments : /* */
    text = text.replace(/\/\*([^*]|\*[^\/]|[\r\n])*\*\//gi, "");

    // single-line comments: //
    text = text.replace(/^([ \t]*\/\/.*\r?\n)+/gi, ""); // at start of text
    text = text.replace(/(\r?\n[ \t]*\/\/.*)+\r?\n/gi, Indenter.getLineSeparator()); // that occupy entire lines
    text = text.replace(/[ \t]*\/\/.*/g, ""); // at ends of lines
    return text;
  }

  function stripCommentsClick(event) {
    if ($(this).prop("disabled")) {
      return Events.abort(event);
    }
    setSolutionCode(stripComments(getSolutionCode()));
    return Events.abort(event);
  }

  function syntaxHighlightCodeInProblemDescription() {
    if (typeof CodeMirror === "undefined") {
      return;
    }

    var preBlocks = document.querySelectorAll("pre.c, " + "pre.code, " + "pre.cpp, " + "pre.csharp, " + "pre.css, " + "pre.go, " + "pre.html, " + "pre.java, " + "pre.javascript, " + "pre.js, " + "pre.kotlin, " + "pre.ml, " + "pre.perl, " + "pre.php, " + "pre.python, " + "pre.racket, " + "pre.ruby, " + "pre.rust, " + "pre.sml, " + "pre.swift, " + "pre.vb");

    for (var i = 0; i < preBlocks.length; i++) {
      var pre = preBlocks[i];

      // patch a bit about the content
      var text = Page.getTextContent(pre).rtrim();
      text = text.replace(/(?:<var>)?your code goes here[;]?(?:<\/var>)?/g, "// your code goes here");
      text = text.replace("&lt;var&gt;", "");
      text = text.replace("&lt;/var&gt;", "");

      if (!pre.classList.contains("nopreprocess")) {
        text = preprocessSolutionCode(text);
      }

      Page.setTextContent(pre, text);

      CodeMirrorSupport.turnOnReadOnly(pre);
    }
  }

  function turninQuizClick(event) {
    if (confirm("Are you sure you want to turnin your quiz?  Once you turn in " + "your quiz, the quiz will be over and you will see your results.  " + "You will not be able to return to the quiz after it is turned in.")) {
      stopTimedQuiz();
    } else {
      return Events.abort(event);
    }
  }

  /** Updates the string for converting tabs to spaces. */
  function updateTabString() {
    var $indentspacecount = $("#indentspacecount");
    var spaces = Math.max(0, parseInt($indentspacecount.val()));
    if (spaces > 0 && spaces < 80) {
      Indenter.setTabSpaces(spaces);
    }
  }

  function windowBeforeUnload(event) {
    if (!isMultiLanguageProblem() && $("#solution, .solution").prop("initialValue") != getSolutionCode()) {
      var confirmMsg = "You have not submitted your latest code.  You may want to submit/save it before moving on.";

      // https://developer.mozilla.org/en/DOM/window.onbeforeunload says I should do this
      if (event) {
        event.returnValue = confirmMsg;
      }
      return confirmMsg;
    }
  }

  function windowResize(event) {
    checkSplitPane();
  }

  console.log("I'm here!");
  // processServerSideSolution()
  //showSolutionClick();
  solutionSubmitClick();
})();
