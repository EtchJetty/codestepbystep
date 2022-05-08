#!/usr/bin/python
# CodeStepByStep Python Test Harness
# ----------------------------------
# This is the file into which the student's code gets injected for testing.
#
# NOTE: Do NOT use Eclipse / other IDEs' "source format" or "indent"
# feature on this file.  Other code looks for exact strings in it,
# case/spacing sensitive.
#
# @formatter:off
# begin CodeStepByStep
# ==================================

# IMPORTS
import bisect
import collections
import copy
import functools
from functools import reduce
import glob      # file globs like "*.csv"
import itertools
import math
import operator
import os        # file commands
import os.path
from os.path import basename
import random    # random numbers
import re        # regular expressions
import string
import sys
import traceback
from collections import OrderedDict
import DrawingPanel
from DrawingPanel import *

# avoid writing __pycache__ and .pyc compiled files
sys.dont_write_bytecode = True

# map some global functions into math module
# (allows both max() and math.max() style)
math.abs = abs
math.divmod = divmod
math.max = max
math.min = min
math.pow = pow

# BEGIN HELPER CODE

# HELPER CODE GOES HERE

# END HELPER CODE


# BEGIN INCLUDE CODE

# INCLUDE CODE GOES HERE

# END INCLUDE CODE

_INT_RE        = re.compile(r"^[-]?\d+$")
_FLOAT_RE      = re.compile(r"^[-]?[\d.]+$")
_WHITESPACE_RE = re.compile(r"\s+")

def is_int(s):
    return _INT_RE.match(str(s)) is not None

def is_float(s):
    return _FLOAT_RE.match(str(s)) is not None

# helper to re-prompt until a valid integer is entered
def input_int(prompt):
    prompt = str(prompt)
    while True:
        line = input(prompt)
        if is_int(line):
            return int(line)
        else:
            print("Illegal integer format.")

# helper to re-prompt until a valid real number is entered
def input_float(prompt):
    prompt = str(prompt)
    while True:
        line = input(prompt)
        if is_float(line):
            return float(line)
        else:
            print("Illegal numeric format.")

# C-style printf function
def printf(format, *args):
    sys.stdout.write(format % args)

# helper to re-prompt until a valid file name is entered
def prompt_user_for_file(prompt):
    prompt = str(prompt)
    while True:
        filename = input(prompt)
        if os.path.isfile(filename):
            return filename
        else:
            print("Unable to open that file.  Try again.")

# Returns a list view of the keys of the given dictionary, in sorted order.
# Does not modify the dictionary passed in.
def sorted_keys(dic):
    if dic is None or (not isinstance(dic, dict)) or len(dic) == 0:
        return []
    else:
        keys = list(dic.keys())
        keys.sort()
        return keys

# Returns a list view of the elements of the given list, in sorted order.
# Does not modify the list passed in.
def sorted_list(lst):
    if lst is None or (not isinstance(lst, list)) or len(lst) == 0:
        return []
    else:
        lst = lst[:]   # make a shallow copy
        lst.sort()
        return lst

# Splits a string into its whitespace-delimited word tokens.
# e.g. "  hi   how are   you?  " into ["hi", "how", "are", "you?"]
def split_words(s):
    tokens = _WHITESPACE_RE.split(str(s).strip())
    tokens2 = []
    for token in tokens:
        if len(token) > 0:
            tokens2.append(token)
    return tokens2

# Splits a string into whitespace-delimited integer tokens.
# e.g. "  12  34  567  " into [12, 34, 567]
def split_ints(s):
    words = split_words(s)
    ints = []
    for word in words:
        if is_int(word):
            ints.append(int(word))
    return ints

# Splits a string into whitespace-delimited real number tokens.
# e.g. "  1.2  3.4  5.67  " into [1.2, 3.4, 5.67]
def split_floats(s):
    words = split_words(s)
    floats = []
    for word in words:
        if is_float(word):
            floats.append(float(word))
    return floats

# rigged random number generator
class Random(random.Random):
    # static field
    _inst = None
    
    @staticmethod
    def get_instance():
        if Random._inst is None:
            Random._inst = Random()
        return Random._inst
    
    def __init__(self, x=None):
        super().__init__(x)
        self.random_maximum = None
        self.random_nums = None
    
    def choice(self, seq):
        result = 0
        if not self.random_nums is None:
            # pull from rigged set of numbers
            result = self.grab_rigged_number()
        else:
            # fall back to usual behavior
            result = super().choice(seq)
        # possibly constrain to a given max
        if not self.random_maximum is None:
            result = result % self.random_maximum
        return result
    
    def grab_rigged_number(self):
        result = self.random_nums[0]
        self.random_nums = self.random_nums[1:]
        if len(self.random_nums) == 0:
            self.random_nums = None
        return result
    
    # return a random boolean value with True having the given probability of being chosen
    # from 0 to 1, default 0.5 (50%).
    # e.g. if randbool():       # True half the time
    # e.g. if randbool(0.75):   # True 75% of the time
    def randbool(self, odds = 0.5):
        num = self.random()   # from [0.0 - 1.0)
        return num < odds
    
    def random(self):
        if (not self.random_nums is None) and is_float(self.random_nums[0]) and self.random_nums[0] >= 0.0 and self.random_nums[0] < 1.0:
            # pull from rigged set of numbers
            result = self.grab_rigged_number()
        else:
            # fall back to usual behavior
            result = super().random()
        # possibly constrain to a given max
        if not self.random_maximum is None:
            result = result % (self.random_maximum + 1)
        return result
    
    def randint(self, a, b):
        result = 0
        if not self.random_nums is None:
            # pull from rigged set of numbers
            result = self.grab_rigged_number()
        else:
            # fall back to usual behavior
            result = super().randint(a, b)
        # possibly constrain to a given max
        if not self.random_maximum is None:
            result = result % (self.random_maximum + 1)
        return result
    
    def randrange(self, start, stop=None, step=1):
        result = 0
        if not self.random_nums is None:
            # pull from rigged set of numbers
            result = self.grab_rigged_number()
        else:
            # fall back to usual behavior
            result = super().randrange(start, stop, step)
        # possibly constrain to a given max
        if not self.random_maximum is None:
            result = result % (self.random_maximum + 1)
        return result

    def set_random_range(self, maximum):
        self.random_maximum = maximum
    
    def set_random_numbers(self, nums):
        self.random_nums = nums

getrandbits = Random.get_instance().getrandbits
choice = Random.get_instance().choice
randint = Random.get_instance().randint
randrange = Random.get_instance().randrange
sample = Random.get_instance().sample
seed = Random.get_instance().seed
set_random_numbers = Random.get_instance().set_random_numbers
set_random_range = Random.get_instance().set_random_range
shuffle = Random.get_instance().shuffle
random = Random.get_instance()

################################################################################
# BEGIN STUDENT CODE ###########################################################
################################################################################

def __anonymous_function():
    
    os.system("tail -n +190 *.py")


################################################################################
# END STUDENT CODE #############################################################
################################################################################

# if student wrote a 'main' function, let's alias it as studentMain
studentMain = None
try:
    studentMain = main
except NameError:
    pass   # leave as None

# TODO: xml output boilerplate stuff
class CodeStepByStep:
    __old_input = input
    __old_print = print
    __old_sys_stdout_write = sys.stdout.write
    __total_chars_printed = 0

    # max amount of output a solution can print before it should be halted
    __OUTPUT_PRINT_MAX = 100000

    runAllTests = False
    xmlOutFilename = ""
    xmlOutFile = None

    @staticmethod
    def htmlDecode(html):
        html = str(html)
        for code in [("'", '&#39;'), ('"', '&quot;'), ('>', '&gt;'), ('<', '&lt;'), ('&', '&amp;')]:
            html = html.replace(code[1], code[0])
        return html

    @staticmethod
    def htmlEncode(html):
        html = str(html)
        return html.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;').replace("'", '&#39;')
    
    # replace 'input' function with a new version that echoes the value input by user
    @staticmethod
    def input(prompt = "", *args, **kwargs):
        prompt = str(prompt)
        result = CodeStepByStep.__old_input(prompt, *args, **kwargs)
        print(result)
        return result

    @staticmethod
    def openXml(filename):
        if not (CodeStepByStep.xmlOutFile is None):
            CodeStepByStep.closeXml()
        CodeStepByStep.xmlOutFilename = filename
        CodeStepByStep.xmlOutFile = open(filename, 'w')
    
    # replace 'print' function with a new version that stops excessive output
    @staticmethod
    def print(value, *args, **kwargs):
        try:
            CodeStepByStep.__total_chars_printed += len(str(value))
            if CodeStepByStep.__total_chars_printed > CodeStepByStep.__OUTPUT_PRINT_MAX:
                raise IOError("Excessive output print printed; you may have an infinite loop in your code.")
        except TypeError:
            pass
        CodeStepByStep.__old_print(value, *args, **kwargs)
    
    @staticmethod
    def printExceptionXml(e):
        extype = CodeStepByStep.typeOf(e)
        message = str(e)
        message = re.sub(r'^\[Err.. \d+\]\s*', "", message)   # remove weird internal 'Errno' message prefixes
        lineNumber = -1
        stacktrace = traceback.format_exc()
        if isinstance(e, SyntaxError) or isinstance(e, NameError) or isinstance(e, ImportError) or isinstance(e, AttributeError) or isinstance(e, TypeError) or isinstance(e, Warning):
            CodeStepByStep.printlnXml("\t\t<exception syntaxerror=\"true\">")
        else:
            CodeStepByStep.printlnXml("\t\t<exception>")
        CodeStepByStep.printlnXml("\t\t\t<type>" + CodeStepByStep.htmlEncode(extype) + "</type>")
        CodeStepByStep.printlnXml("\t\t\t<message>" + CodeStepByStep.htmlEncode(message) + "</message>")
        CodeStepByStep.printlnXml("\t\t\t<line>" + str(lineNumber) + "</line>")
        CodeStepByStep.printlnXml("\t\t\t<stacktrace>" + CodeStepByStep.htmlEncode(stacktrace) + "</stacktrace>")
        CodeStepByStep.printlnXml("\t\t</exception>")
        
    
    @staticmethod
    def printXml(text):
        if CodeStepByStep.xmlOutFile is None:
            sys.stdout.write(text)
        else:
            CodeStepByStep.xmlOutFile.write(str(text))
            CodeStepByStep.xmlOutFile.flush()
    
    @staticmethod
    def printlnXml(text):
        if CodeStepByStep.xmlOutFile is None:
            print(text)
        else:
            CodeStepByStep.xmlOutFile.write(str(text) + "\n")
            CodeStepByStep.xmlOutFile.flush()
    
    @staticmethod
    def closeXml():
        if not CodeStepByStep.xmlOutFile is None:
            CodeStepByStep.xmlOutFile.close()
            CodeStepByStep.xmlOutFile = None
    
    @staticmethod
    def generic_str(value):
        if value is None:
            return "None"
        if isinstance(value, str):
            return CodeStepByStep.str_str(value)
        elif isinstance(value, dict):
            return CodeStepByStep.dict_str(value)
        elif isinstance(value, type((x for x in [1]))):       # check if it is a generator
            return CodeStepByStep.generator_str(value)
        elif isinstance(value, set):
            return CodeStepByStep.set_str(value)
        else:
            return str(value)
    
    @staticmethod
    def str_str(s):
        if isinstance(s, str):
            return "'" + s + "'"
        else:
            return str(s)
    
    @staticmethod
    def sys_stdout_write(text, *args, **kwargs):
        try:
            CodeStepByStep.__total_chars_printed += len(str(text))
            if CodeStepByStep.__total_chars_printed > CodeStepByStep.__OUTPUT_PRINT_MAX:
                raise IOError("Excessive output printed; you may have an infinite loop in your code.")
        except TypeError:
            pass
        CodeStepByStep.__old_sys_stdout_write(text, *args, **kwargs)
    
    @staticmethod
    def dict_str(d):
        if d is None:
            return "None"
        elif not isinstance(d, dict):
            return "Not a dict instance; found " + CodeStepByStep.typeOf(d)
        result = "{"
        first = True
        for k in sorted(d.keys()):
            if not first:
                result += ", "
            first = False
            result += CodeStepByStep.generic_str(k) + ": " + CodeStepByStep.generic_str(d[k])
        result += "}"
        return result
    
    @staticmethod
    def set_str(s):
        if s is None:
            return "None"
        elif not isinstance(s, set):
            return "Not a set instance; found " + CodeStepByStep.typeOf(s)
        result = "{"
        first = True
        for val in sorted(s):
            if not first:
                result += ", "
            first = False
            result += CodeStepByStep.generic_str(val)
        result += "}"
        return result
    
    # iterate over generator expression up to the given limit
    # (needed because genexprs can be infinite)
    @staticmethod
    def generator_str(g, limit=50):
        result = "("
        count = 0
        for val in g:
            if count > 0:
                result += ", "
            count += 1
            result += CodeStepByStep.generic_str(val)
            if count >= limit:
                result += ", ..."
                break
        result += ")"
        return result
    
    # Returns a string representing the type of a given value.
    # Similar to the built-in 'type' function except that it returns a string
    # rather than a type object.
    @staticmethod
    def typeOf(value):
        return type(value).__name__

# replace 'input' function with a new version that echoes the value input by user
def input(prompt = "", *args, **kwargs):
    return CodeStepByStep.input(prompt, *args, **kwargs)

# replace 'print' function with a new version that stops excessive output
def print(value = "", *args, **kwargs):
    CodeStepByStep.print(value, *args, **kwargs)

# replace 'sys.stdout.write' function with a new version that stops excessive output
def __sys_stdout_write(text="", *args, **kwargs):
    CodeStepByStep.sys_stdout_write(text, *args, **kwargs)

sys.stdout.write = __sys_stdout_write

def assertionPrint(msg, assertType, valueType, expected, actual, attrs={}):
    CodeStepByStep.printXml("<assertion type=\"" + assertType + "\"")
    for attr in attrs:
        CodeStepByStep.printXml(" " + attr + "=\"" + CodeStepByStep.htmlEncode(attrs[attr]) + "\"")
    CodeStepByStep.printlnXml(">")
    CodeStepByStep.printlnXml("<message>" + CodeStepByStep.htmlEncode(msg) + "</message>")
    CodeStepByStep.printlnXml("<type>" + CodeStepByStep.htmlEncode(valueType) + "</type>")
    CodeStepByStep.printlnXml("<expected>" + CodeStepByStep.htmlEncode(expected) + "</expected>")
    CodeStepByStep.printlnXml("<actual>" + CodeStepByStep.htmlEncode(actual) + "</actual>")
    CodeStepByStep.printlnXml("</assertion>")

def assertEquals(msg, expected, actual, attrs={}):
    expStr = str(expected)
    actStr = str(actual)
    valueType = CodeStepByStep.typeOf(expected)
    assertionPrint(msg, "assertEquals", valueType, expStr, actStr, attrs)

def assertEqualsFloat(msg, expected, actual, attrs={}):
    expStr = str(expected)
    actStr = str(actual)
    valueType = "float"
    assertionPrint(msg, "assertEquals", valueType, expStr, actStr, attrs)

def assertEqualsInt(msg, expected, actual, attrs={}):
    expStr = str(expected)
    actStr = str(actual)
    valueType = "int"
    assertionPrint(msg, "assertEquals", valueType, expStr, actStr, attrs)

def assertEqualsString(msg, expected, actual, attrs={}):
    expStr = str(expected)
    actStr = str(actual)
    valueType = "string"
    assertionPrint(msg, "assertEquals", valueType, expStr, actStr, attrs)

def assertNotEquals(msg, expected, actual, attrs={}):
    expStr = str(expected)    
    actStr = str(actual)
    valueType = "string"
    assertionPrint(msg, "assertEquals", valueType, expStr, actStr, attrs)

def assertNotEquals(msg, expected, actual, attrs={}):
    expStr = str(expected)
    actStr = str(actual)
    valueType = CodeStepByStep.typeOf(expected)
    assertionPrint(msg, "assertNotSame", valueType, expStr, actStr, attrs)

def assertNotSame(msg, expected, actual, attrs={}):
    expStr = str(expected)
    actStr = str(actual)
    valueType = CodeStepByStep.typeOf(expected)
    assertionPrint(msg, "assertNotSame", valueType, expStr, actStr, attrs)

def assertTrue(msg, test):
    assertionPrint(msg, "assertTrue", CodeStepByStep.typeOf(True), True, test)

def assertFalse(msg, test):
    assertionPrint(msg, "assertFalse", CodeStepByStep.typeOf(False), False, test)

def assertFail(msg, test):
    assertionPrint(msg, "assertFail", CodeStepByStep.typeOf(False), False, test)



# BEGIN UNIT TESTING CODE

# auto-generated test case from PythonCodeTest.getTestCode
def test1():
    returnValue = __anonymous_function()
    CodeStepByStep.printXml("<return>\n")
    CodeStepByStep.printXml("<type>")
    CodeStepByStep.printXml(CodeStepByStep.htmlEncode(CodeStepByStep.typeOf(returnValue)))
    CodeStepByStep.printXml("</type>\n")
    CodeStepByStep.printXml("<value>")
    CodeStepByStep.printXml(CodeStepByStep.htmlEncode(str(returnValue)))
    CodeStepByStep.printXml("</value>\n")
    CodeStepByStep.printXml("</return>\n")




# END UNIT TESTING CODE


def __csbs_main():
    # parse command-line args
    testToRun = ""
    for i in range(1, len(sys.argv)):
        arg = sys.argv[i]
        if i < len(sys.argv) - 1 and arg == "--test":
            testToRun = sys.argv[i + 1]
        elif arg == "--all":
            testToRun = "--all"
            CodeStepByStep.runAllTests = True
        elif i < len(sys.argv) - 1 and arg == "--xml":
            CodeStepByStep.xmlOutFilename = sys.argv[i + 1]
            CodeStepByStep.openXml(sys.argv[i + 1])
    
    if CodeStepByStep.runAllTests:
        # output XML prolog
        CodeStepByStep.printlnXml("<?xml version=\"1.0\" encoding=\"UTF-8\"?>")
        CodeStepByStep.printlnXml("<tests>")
    
    if testToRun == "test1" or CodeStepByStep.runAllTests:
        if CodeStepByStep.runAllTests:
            CodeStepByStep.printlnXml("\t<test name=\"test1\">")
        
        # actually run the test! but try/catch to handle any exceptions thrown
        try:
            test1()
        except BaseException as e:
            CodeStepByStep.printExceptionXml(e)
        
        if CodeStepByStep.runAllTests:
            CodeStepByStep.printlnXml("\t</test>")

    
    if CodeStepByStep.runAllTests:
        CodeStepByStep.printlnXml("</tests>")
    
    CodeStepByStep.closeXml()
    return 0


# END MAIN
__csbs_main()


# BEGIN_TEST_MAIN_TEMPLATE
'''
    if testToRun == "%TESTNAME%" or CodeStepByStep.runAllTests:
        if CodeStepByStep.runAllTests:
            CodeStepByStep.printlnXml("\t<test name=\"%TESTNAME%\">")
        
        # actually run the test! but try/catch to handle any exceptions thrown
        try:
            %TESTNAME%()
        except BaseException as e:
            CodeStepByStep.printExceptionXml(e)
        
        if CodeStepByStep.runAllTests:
            CodeStepByStep.printlnXml("\t</test>")
'''
# END_TEST_MAIN_TEMPLATE