import os
import click
from flask_migrate import Migrate
from app import create_app, db
from app.models import User, Role, URL

app = create_app('development')
# !!! in production environment
# app = create_app(os.getenv('FLASK_CONFIG'))
migrate = Migrate(app, db)


@app.shell_context_processor
def make_shell_context():
    return dict(db=db, User=User, Role=Role, URL=URL)


@app.cli.command()
def test():
    """Run the unit tests."""
    import unittest
    tests = unittest.TestLoader().discover('tests')
    unittest.TextTestRunner(verbosity=2).run(tests)
