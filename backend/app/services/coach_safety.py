"""Keyword pre-filter for the AI coach. If a message matches, the coach returns a fixed, careful reply and
NEVER calls the LLM. This is a coarse safety net, not a clinical triage tool."""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.fitness_engine import MIN_KCAL


@dataclass(frozen=True)
class Safety:
    category: str
    reply: str


EMERGENCY = re.compile(
    r"\b(chest (pain|pressure|tightness)|can'?t breathe|cannot breathe|trouble breathing|short(ness)? of breath|"
    r"faint(ed|ing)?|passed? out|blacked? out|heart attack|stroke|seizure|coughing (up )?blood|blood in (my )?(stool|urine|vomit)|"
    r"severe (pain|dizziness)|numbness in (my )?(arm|face)|irregular heartbeat|heart palpitations)\b", re.I)
SELF_HARM = re.compile(r"\b(kill myself|suicid\w*|end my life|want to die|hurt myself|self[- ]?harm|don'?t want to live)\b", re.I)
EATING_DISORDER = re.compile(
    r"\b(anorexi\w*|bulimi\w*|binge[- ]?eat\w*|purg(e|ing)|make myself (throw up|vomit)|starv(e|ing) myself|"
    r"laxatives? (to|for) (lose|weight)|eating disorder|hate (eating|food)|punish myself (for|with) (eating|food))\b", re.I)
MEDICAL_CONTEXT = re.compile(
    r"\b(pregnan\w*|breastfeed\w*|nursing mother|insulin|metformin|diabet\w* (medication|meds|drug)|blood thinners?|warfarin|"
    r"chemo\w*|dialysis|kidney (disease|failure)|heart (disease|condition|failure)|eating while on (medication|meds)|"
    r"medication|prescription|my doctor (said|told))\b", re.I)
EXTREME_FAST = re.compile(r"\b(water fast|dry fast|fast(ing)? for (\d+|several|a few) days|no food for (\d+|several) days|"
                          r"(eat|eating) nothing|zero[- ]calorie diet|starvation diet|crash diet)\b", re.I)
# a low calorie number only counts when tied to eating/dieting ("eat 500 calories", "a 600 calorie diet", "800 kcal a day")
KCAL_NUMBER = re.compile(
    r"\b(?:eat|eating|diet|limit|restrict(?:ing)?|only|consume|consuming|under|below|just|on)\b[^.?!]{0,30}?\b(\d{3,4})\s*(?:k?cal|calories?)\b"
    r"|\b(\d{3,4})\s*(?:k?cal|calories?)\s*(?:a day|per day|daily|diet)\b", re.I)

REPLIES = {
    "emergency": ("What you describe could be serious. Please stop exercising and get medical help right away: contact your local "
                  "emergency number or go to the nearest emergency department. I can't assess symptoms, and I don't want you to wait on a chat reply."),
    "self_harm": ("I'm really sorry you're feeling this way, and I'm glad you said something. You deserve support from a real person right now. "
                  "If you might act on these thoughts, please call your local emergency number. In the US you can call or text 988; elsewhere, "
                  "findahelpline.com lists free services by country. Reaching out to someone you trust today can also help. I'm here to talk about fitness whenever you're ready."),
    "eating_disorder": ("Thank you for trusting me with this. I can't give diet or weight-loss advice for what you're describing, because it could "
                        "make things harder. Eating disorders are real, treatable conditions, and a doctor or a registered dietitian or therapist "
                        "experienced in eating concerns can help. If you're in the US, the NEDA/ANAD helplines and your doctor are good first steps; "
                        "elsewhere, please contact your local health service. You don't have to handle this alone."),
    "medical_context": ("Because medications, pregnancy, breastfeeding or a medical condition can change what's safe for nutrition and exercise, "
                        "I can't give personalised advice here. Please check with your doctor or a registered dietitian before changing your diet "
                        "or training. Once they've advised you, I'm happy to help with general meal ideas and workout structure within their guidance."),
    "extreme_restriction": ("I can't recommend that. Eating far below your body's needs, or going without food for days, can cause muscle loss, "
                            f"dizziness and other health problems. As a general guide, plans shouldn't go below about {MIN_KCAL['female']}-{MIN_KCAL['male']} kcal "
                            "per day without medical supervision, and your own target is shown in the app. I can help you build a sustainable plan with a "
                            "moderate deficit and enough protein if you'd like."),
}


def check(message: str) -> Safety | None:
    m = message or ""
    if SELF_HARM.search(m):
        return Safety("self_harm", REPLIES["self_harm"])
    if EMERGENCY.search(m):
        return Safety("emergency", REPLIES["emergency"])
    if EATING_DISORDER.search(m):
        return Safety("eating_disorder", REPLIES["eating_disorder"])
    if EXTREME_FAST.search(m):
        return Safety("extreme_restriction", REPLIES["extreme_restriction"])
    for k in KCAL_NUMBER.finditer(m):
        if int(k.group(1) or k.group(2)) < 1000:
            return Safety("extreme_restriction", REPLIES["extreme_restriction"])
    if MEDICAL_CONTEXT.search(m):
        return Safety("medical_context", REPLIES["medical_context"])
    return None
