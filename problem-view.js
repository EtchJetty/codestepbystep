/* jshint strict: true, immed: true, jquery: true, shadow: true, sub: true, -W040 */
/* globals Browser: true, CodeMirror: true, CodeMirrorSupport: true, CodeStepByStep: true, Cookies: true, Events: true, ga: true, Indenter: true, ion: true, Page: true */

/**
 * This is the JS code to support problem.jsp, the page that shows when
 * the user is working on solving a particular problem.
 * 
 * - passes JSHint
 */

(function() {
	"use strict";
	
	// names I'll use for various UI settings in browser cookies
	// (apparently IE doesn't like underscores in cookie names? wtf ie?)
	const INDENT_SPACE_COUNT_COOKIE_NAME = "codestepbystepindentspacecount";
	const SOUND_COOKIE_NAME = "codestepbystepsound";
	const SYNTAX_HIGHLIGHTING_COOKIE_NAME = "codestepbystepsyntaxhighlighting";
	const TIMED_QUIZ_START_COOKIE_NAME = "codestepbysteptimedquizstart";
	const CHECK_JOB_STATUS_TIMEOUT = 750;   // ms between pings to server to check job status
	const SPLIT_PANE_MIN_WIDTH = 1024;

	// sounds to play when user gets problem right
	var SOUNDS_CORRECT = [
		"mario-1up",
		"mario-mushroom",
		"mario-1up"

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
		"mario-buzzer"
					
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
	$(document).ready(function() {
		// don't set up event handling if AdBlock is enabled
		if (CodeStepByStep.ANGRY_AD_FAIL) {
			return;
		}

		var soundsFolder = Page.clientState("SOUNDS_FOLDER");
		if (soundsFolder) {
			// TODO: don't pre-load these every time (slow)
			var sounds = [{ name: "click" }];
			$.each(SOUNDS_CORRECT, function(index, value) {
				sounds.push({
					name: value
				});
			});
			$.each(SOUNDS_INCORRECT, function(index, value) {
				sounds.push({
					name: value
				});
			});

			if (ion && ion.sound) {
				ion.sound({
					sounds: sounds,
					volume: 0.5,
					path: soundsFolder,
					preload: true,
					multiplay: true
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
		if ($showsolutionlink.length) {
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

		var $controlsarea = $("#controlsarea");
		if ($controlsarea.length) {
			if (!$("#userinfoarea").length) {
				$controlsarea.hide();
			} else {
				var $syntaxhighlighting = $("#syntaxhighlighting");
				var $sound = $("#sound");
				if ($controlsarea.is(":visible") && $controlsarea.css("display") !== "none") {
					if ($sound.length) {
						Cookies.makeCheckboxStateful($sound, SOUND_COOKIE_NAME);
					}
				} else {
					if ($sound.length) {
						$sound.prop("checked", false);
					}
					if ($syntaxhighlighting.length) {
						$syntaxhighlighting.prop("checked", true);
					}
				}
				
				if ($syntaxhighlighting.length) {
					Cookies.makeCheckboxStateful($syntaxhighlighting, SYNTAX_HIGHLIGHTING_COOKIE_NAME);
					$syntaxhighlighting.change(codeMirrorToggle);
				}
				
				// activate CodeMirror library to syntax highlight code editor
				codeMirrorToggle();
			}
		}
		
		$("#controlsbutton").click(function() {
			$("#controlsdropdownarea").slideToggle();
			return false;
		});

		// drawing panel problems
		$(".drawingpanelarea").find("img.output").each(function() {
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

		$(".popuplink").each(function() {
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
		$("#contactform").submit(function() {
			var studentsolution = "";
			$("#solutioncontainerdiv").find(".CodeMirror-line").each(function() {
				studentsolution += $(this).text() + "\n";
			});
			$("#studentsolution").val(studentsolution.replace(/\u200B/g, '')); // remove zero-width space characters from code-mirror lines
			$("#problemurl").val(window.location.href); // add current problem page to POST parameters
			$(this).submit();
		});
		$("#contactinstructorform").submit(function() {
			var studentsolution = "";
			$("#solutioncontainerdiv").find(".CodeMirror-line").each(function() {
				studentsolution += $(this).text() + "\n";
			});
			$("#studentsolution").val(studentsolution.replace(/\u200B/g, '')); // remove zero-width space characters from code-mirror lines
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
					gutter: function(index, direction) {
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
		if (typeof(CodeMirror) != "function") {
			return false;
		}
		
		$("#solution, .solution").each(function(index) {
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
					"Up": solutionUpArrowClick,
					"Down": solutionDownArrowClick,
				},
				foldGutter: true,
				gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-lint-markers"],
				mode: mode,
				value: solutionTextArea.value,
			};
			
			if (!embedded) {
				options.viewportMargin = Infinity;   // resize vertically if user types more lines
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
		var x = typeof(event.pageX) == "number" ? event.pageX : event.clientX;
		var y = typeof(event.pageY) == "number" ? event.pageY : event.clientY;
		var table = this.closest("table");
		if (!table) { return; }
		var mousePosArea = $(table).find(".drawingpanelmouseposition");
		if (!mousePosArea) { return; }
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
			var surroundLanguageText = function(solution, language) {
				var commentStart = Page.clientState(language.toLowerCase() + "commentstart") || "/*";
				var commentEnd = Page.clientState(language.toLowerCase() + "commentend") || "*/";
				return "" +
						// comment BEGIN header
						(commentStart + " !!! BEGIN " + language + " SOLUTION CODE !!! " + commentEnd).trim() + "\n" +

						// student's solution itself
						solution +

						// make sure solution ends with a newline
						(solution.endsWith("\n") ? "" : "\n") +

						// comment END header
						(commentStart + " !!! END " + language + " SOLUTION CODE !!! " + commentEnd).trim() + "\n\n";
			};
			
			var returnValue = "";
			if (CodeMirrorSupport.isEnabled()) {
				CodeMirrorSupport.getAllCodeMirrors().forEach(function(codeMirror) {
					var language = codeMirror.getLanguage();
					var solution = codeMirror.getValue();
					returnValue += surroundLanguageText(solution, language);
				});
			} else {
				$("#solution, .solution").each(function(index) {
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
			CodeMirrorSupport.getAllCodeMirrors().forEach(function(codeMirror) {
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
		if (!confirm("Are you sure you want to clear all solution text on the current page?\n" +
				"Any previous solution you submitted to the server is still saved.")) {
			return false;
		}

		$("#solution, .expressionanswer").each(function() {
			$(this).val("");
		});

		$(".multiplechoiceanswer").each(function() {
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

			var goToResults = confirm("Your time is up!  Would you like to stop " +
				"working and go to the results page?  If you click \"Cancel\", " +
				"you can continue working as long as you want and we'll tell you " +
				"the total time you used when you click \"Turn quiz in!\".");
			if (goToResults) {
				window.location.href = "timedquizresults.jsp?category=" + window.location.search.toQueryParams()["category"];
			}
		} else {
			var msLeft = msLeftToCompleteQuiz();
			var secsLeft = Math.round(msLeft / 1000);
			var minsLeft = Math.min(59, Math.ceil(secsLeft % 3600 / 60));
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

		var callback = function() {
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
			success : function(data) {
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
			error : Page.ajaxFailure
		});

		return Events.abort(event);
	}

	function unlikeLinkClick(event) {
		$("#unlikeform").ajaxSubmit({
			success : function(data) {
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
			error : Page.ajaxFailure
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
		var msLeft = (timeToComplete * 60 * 1000) - (now.getTime() - startMs);

		return msLeft;
	}

	// Play sounds if enabled
	function playSound(soundArray){
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
					
					if ((prints && (problemType == "class" || problemType == "partialclass" || problemType == "inheritanceclass")) ||
							code.contains("void run()") || code.contains("void main(")) {
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
		$("#solution, .solution").each(function(index) {
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
		return userType;
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
		$("#controlsdropdownarea").slideToggle();   // hide drop-down menu
	}

	function showSolutionClick(event) {
		Events.abort(event);
		if ($(this).prop("disabled")) {
			return Events.abort(event);
		}

		var $solvedstatus = $("#solvedstatus");
		var unsolved = $solvedstatus.hasClass("unsolved");
		if (unsolved && getUserType() != "administrator" &&
				!confirm("If you peek at the solution, we won't count this problem toward your total.  Are you sure?")) {
			return Events.abort(event);
		}

		$(this).disableLink();

		// fetch solution using Ajax
		// flag them as a dirty stinking cheater
		if (unsolved) {
			$("#cheated").val("1");
		}

		$("#solutionloading").css("visibility", "visible");

		// contact the server to get the solutions and put them on the page
		var that = $(this);
		$.ajax(this.href, {
			method: "get",
			dataType: "xml",
			success: function(data) {
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
								option.val( Page.getTextContent(solutions.item(i)).trim());

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
						var solutionNameRaw = solutions.item(i).getAttribute("name");        // e.g. "mechanical1[]0"
						var questionName = "#" + solutionNameRaw.replace(/[\[\]].*/g, "");   // e.g. "#mechanical1"
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
			error: Page.ajaxFailure
		});

		$("#controlsdropdownarea").slideToggle();   // hide drop-down menu
		return Events.abort(event);
	}

	function showHintsClick(event) {

		var $hintsarea = $("#hintsarea");
		if (!$hintsarea.length) { return; }

		$hintsarea.show();
		var processed = false;
		$("#hintsarea").find(".hint").each(function() {
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
		var enableButton = function() {
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
		if (typeof ga !== "undefined" && isCodeProblem()) {
			// Google Analytics: Record how long it took to process student's solution.
			ga("send", "timing", "Problem", "Process solution", new Date().getTime() - lastSolutionSubmitTimestamp);
		}

		var shouldDoEffect = !isMechanicalProblem() && !($("#testresults"));
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
			if ($passcountmessagespan && $passcountmessagespan.hasClass("passedall")) {
				problemCorrect();
				updateSolved();
			} else if (!$("#submittooquickly").length) {
				problemIncorrect();
			}
		}

		// drawing panel problems
		$(".drawingpanelarea").find("img.output").each(function() {
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
		var lineNumbersInUse = {};   // set of line numbers already occupied by an error
		
		$("#testresultsarea .compilererrors .compilererror, #testresultsarea .exception").each(function() {
			var lineNumber = parseInt($(this).find(".errorlinenumber").attr("rel"), 10);
			if (lineNumber < 0 || isNaN(lineNumber) || lineNumbersInUse[lineNumber]) {
				return;
			}
			var isException = $(this).hasClass("exception");
			var isExpectedException = $(this).data("expected");
			var isSyntaxError = $(this).hasClass("compilererror") || $(this).hasClass("syntaxerror");
			if (isException && isExpectedException) {
				// don't display exceptions as errors in the student code if the test case
				// actually expected/wanted the student to throw an exception
				return;
			}
			
			var errorType = "";
			var errorMessage = Page.getTextContent($(this).find(".errordescription")[0]);
			if (isException) {
				lineNumbersInUse[lineNumber] = true;
				errorType = Page.getTextContent($(this).find(".errortype")[0]);
				
				errorMessage = errorType + (errorMessage ? (": " + errorMessage) : "");
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
			xicon.onclick = function() {
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
				noHScroll: false
			});
			xicon.widget = widget;
			codeMirror._widgets.push(widget);
		});

		solutionAjaxCommon();
	}

	// Runs when student's solution has been enqueued but not yet run.
	// Pings the server periodically until the solutions have been run and tested.
	function solutionAjaxSuccessEnqueue(data, status, ajax) {
		// console.log("solutionAjaxSuccessEnqueue: status " + ajax.status);
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
					"problemid": getProblemID()
			};

			// ping periodically
			setTimeout(function() {
				$.ajax(checkJobStatusUrl, {
					method : "get",
					data : params,
					success : solutionAjaxSuccessEnqueue,
					error : solutionAjaxFailure,
					onException : solutionAjaxFailure
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
			success : solutionAjaxSuccess,
			error : solutionAjaxFailure
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
		CodeMirrorSupport.clearLineWidgets();   // clear any past syntax errors

		// if viewing page in debug mode, pass this on to the server so it'll produce extra output
		var pageQueryParams = Page.getQueryString();
		if (Page.inDebugMode()) {
			params["debug"] = pageQueryParams["debug"];
		}
		if (pageQueryParams["captureoutput"]) {
			params["captureoutput"] = pageQueryParams["captureoutput"];
		}

		lastSolutionSubmitTimestamp = new Date().getTime();

		$.ajax($solutionform.prop("action"), {
			method : "post",
			data : params,
			success : solutionAjaxSuccessEnqueue,
			error : solutionAjaxFailure
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
		if (event.which == 13) { // new line, \n
			result = Indenter.insertCharacter(textarea, Indenter.getLineSeparator(), false);

			// possibly grow text area to accommodate newly entered lines
			var lineCount = Page.getTextContent(textarea).split(Indenter.getLineSeparator()).length;
			// alert(lineCount);
			if (lineCount > textarea.rows - (Browser.isIE() ? 4 : 0)) {
				resizeSolution(lineCount + (Browser.isIE() ? 4 : 0));
			}

		} else if (event.which == 9) { // tab, \t
			if (!event.ctrlKey && !event.altKey && !event.metaKey) {
				result = Indenter.insertCharacter(textarea, Indenter.getTabString(), event.shiftKey);
			}
		} else if (typeof(event.which) !== "undefined" && event.which == "}".charCodeAt(0)) {
			// special case to unindent for closing braces
			result = Indenter.insertCharacter(textarea, "}", event.shiftKey);
		} else if (event.altKey && typeof(event.charCode) !== "undefined") {
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

		if (!result) { // cancel the event
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
		if (typeof(CodeMirror) === "undefined") {
			return;
		}
		
		var preBlocks = document.querySelectorAll(
				"pre.c, " +
				"pre.code, " +
				"pre.cpp, " +
				"pre.csharp, " +
				"pre.css, " +
				"pre.go, " +
				"pre.html, " +
				"pre.java, " +
				"pre.javascript, " +
				"pre.js, " + 
				"pre.kotlin, " +
				"pre.ml, " +
				"pre.perl, " +
				"pre.php, " +
				"pre.python, " + 
				"pre.racket, " +
				"pre.ruby, " +
				"pre.rust, " +
				"pre.sml, " +
				"pre.swift, " +
				"pre.vb"
		);
		
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
		if (confirm("Are you sure you want to turnin your quiz?  Once you turn in " +
				"your quiz, the quiz will be over and you will see your results.  " +
				"You will not be able to return to the quiz after it is turned in.")) {
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
})();
