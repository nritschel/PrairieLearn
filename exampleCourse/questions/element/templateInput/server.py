import random


def generate(data):
    a = random.randint(2, 5)
    t = random.randint(3, 8)
    data["params"]["a"] = a
    data["params"]["t"] = t
    data["correct_answers"]["v"] = a * t
    data["correct_answers"]["d"] = a * t**2 / 2
