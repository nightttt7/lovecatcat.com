from flask import render_template
from flask_login import current_user
from . import account
from ..models import Permission, Post
from ..decorators import permission_required


@account.route('/')
@permission_required(Permission.BLOG)
def index():
    post_and_comment_s = []
    for post in Post.query.filter_by(author_id=current_user.id):
        for comment in post.comments:
            post_and_comment_s.append({'post': post, 'comment': comment})
    post_and_comment_s.sort(key=lambda x: x['comment'].timestamp, reverse=True)

    return render_template('account/index.html',
                           post_and_comment_s=post_and_comment_s,
                           current_user=current_user)
